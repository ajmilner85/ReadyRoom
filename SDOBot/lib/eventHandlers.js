/**
 * EVENT HANDLERS MODULE
 * Handles button interactions and Discord event handlers
 */

const { getClient } = require('./discordClient');
const { createEventEmbed, createAdditionalImageEmbeds } = require('./embedCreator');
const { createAttendanceButtons } = require('./messageManager');

// Track recently processed interactions to prevent duplicates
const processedInteractions = new Map();
const INTERACTION_CACHE_TTL = 30000; // 30 seconds

// Clean up old interaction IDs periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of processedInteractions.entries()) {
    if (now - timestamp > INTERACTION_CACHE_TTL) {
      processedInteractions.delete(id);
    }
  }
}, 60000); // Clean up every minute

/**
 * Setup Discord event handlers
 */
function setupDiscordEventHandlers(supabase, upsertEventAttendance, getEventByDiscordId, fetchSquadronTimezone, extractEmbedDataFromDatabaseEvent, eventResponses) {
  const client = getClient();
  
  // Remove all existing interactionCreate listeners to prevent duplicates
  client.removeAllListeners('interactionCreate');

  // Handle button interactions
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const interactionId = interaction.id;

    // Distributed deduplication using Supabase
    try {
      const { data, error } = await supabase
        .from('processed_interactions')
        .insert({
          interaction_id: interactionId,
          processed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30000).toISOString()
        })
        .select();

      if (error) {
        if (error.code === '23505') {
          console.log(`[DISTRIBUTED-DEDUPE] Interaction ${interactionId} already processed by another instance`);
          return;
        }
        console.error(`[DISTRIBUTED-DEDUPE] Error checking interaction ${interactionId}:`, error);
      }
    } catch (err) {
      console.error(`[DISTRIBUTED-DEDUPE] Unexpected error:`, err);
    }

    // Local cache for fast local deduplication
    if (processedInteractions.has(interactionId)) {
      console.log(`[LOCAL-DEDUPE] Skipping duplicate interaction ${interactionId} from ${interaction.user.username}`);
      return;
    }
    processedInteractions.set(interactionId, Date.now());
    
    const { customId, message, user } = interaction;
    const eventId = message.id;
    const displayName = interaction.member.displayName;
    const userId = user.id;

    // IMMEDIATELY acknowledge the interaction
    try {
      await interaction.deferUpdate();
    } catch (error) {
      console.error(`[INTERACTION] Failed to defer interaction:`, error);
      return;
    }

    // Always get fresh event data from database
    let eventData = eventResponses.get(eventId);
    let freshEventTime = null;
    
    const { event: dbEvent, error: dbEventError } = await getEventByDiscordId(eventId);
    if (!dbEventError && dbEvent) {
      const parseDateTime = (dateTimeString, fallback = new Date()) => {
        if (!dateTimeString) return fallback;
        try {
          const date = new Date(dateTimeString);
          return isNaN(date.getTime()) ? fallback : date;
        } catch (error) {
          console.warn(`[DATE-PARSE] Error parsing datetime "${dateTimeString}":`, error.message);
          return fallback;
        }
      };

      freshEventTime = {
        start: parseDateTime(dbEvent.start_datetime),
        end: parseDateTime(dbEvent.end_datetime, new Date(new Date().getTime() + (60 * 60 * 1000)))
      };
    }
    
    if (!eventData) {
      if (dbEvent) {
        console.log(`Found event data in database for message ID: ${eventId}`);
        eventData = {
          title: dbEvent.name || dbEvent.title || 'Event',
          description: dbEvent.description || '',
          eventTime: freshEventTime,
          imageUrl: dbEvent.image_url,
          images: {
            imageUrl: dbEvent.image_url,
            headerImage: dbEvent.header_image_url,
            additionalImages: dbEvent.additional_image_urls || []
          },
          creator: {
            boardNumber: dbEvent.creator_board_number || '',
            callsign: dbEvent.creator_call_sign || '',
            billet: dbEvent.creator_billet || ''
          },
          guildId: Array.isArray(dbEvent.discord_event_id) && dbEvent.discord_event_id.length > 0 
            ? dbEvent.discord_event_id[0].guildId 
            : null,
          accepted: [],
          declined: [],
          tentative: []
        };
        
        eventResponses.set(eventId, eventData);
      } else {
        console.log(`Could not find event data for message ID: ${eventId} in database either`);
        return;
      }
    } else {
      if (freshEventTime) {
        eventData.eventTime = freshEventTime;
      }
    }
    
    // Map Discord status to database response type
    let userResponse;
    if (customId === 'accept') {
      userResponse = 'accepted';
    } else if (customId === 'decline') {
      userResponse = 'declined';
    } else if (customId === 'tentative') {
      userResponse = 'tentative';
    }

    // Get event details from database
    const { event, error: eventError } = await getEventByDiscordId(eventId);

    if (eventError) {
      console.warn(`Warning: Could not find event for Discord message ${eventId}: ${eventError}`);
    }

    // Fetch pilot data from database
    let pilotRecord = null;
    try {
      const { data: pilotData, error: pilotError } = await supabase
        .from('pilots')
        .select(`
          *,
          pilot_qualifications(
            qualification_id,
            qualification:qualifications(name)
          )
        `)
        .eq('discord_id', userId)
        .single();

      if (!pilotError && pilotData) {
        let squadronData = null;
        try {
          const { data: assignment, error: assignmentError } = await supabase
            .from('pilot_assignments')
            .select('squadron_id')
            .eq('pilot_id', pilotData.id)
            .is('end_date', null)
            .single();

          if (!assignmentError && assignment?.squadron_id) {
            const { data: squadron, error: squadronError } = await supabase
              .from('org_squadrons')
              .select('id, designation, name, discord_integration')
              .eq('id', assignment.squadron_id)
              .single();

            if (!squadronError) {
              squadronData = squadron;
            }
          }
        } catch (err) {
          console.warn(`[SQUADRON-FETCH] Could not fetch squadron for pilot ${pilotData.id}`);
        }

        pilotRecord = {
          id: pilotData.id,
          callsign: pilotData.callsign,
          boardNumber: pilotData.boardNumber?.toString() || '',
          qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
          currentStatus: { name: pilotData.status || 'Provisional' },
          squadron: squadronData
        };
        console.log(`[PILOT-DATA] Found pilot record for ${displayName}:`, {
          ...pilotRecord,
          qualifications: pilotRecord.qualifications
        });
      } else {
        console.log(`[PILOT-DATA] No pilot record found for Discord ID ${userId}`);
      }
    } catch (error) {
      console.warn(`[PILOT-DATA] Error fetching pilot data for ${displayName}:`, error.message);
    }

    // Store the attendance in Supabase
    if (userResponse) {
      try {
        const formattedUsername = pilotRecord
          ? (pilotRecord.boardNumber ? `${pilotRecord.boardNumber} ${pilotRecord.callsign}` : pilotRecord.callsign)
          : displayName;

        const { data, error } = await upsertEventAttendance({
          discordEventId: eventId,
          discordUserId: userId,
          discordUsername: formattedUsername,
          userResponse
        });

        if (error) {
          console.error('Error saving attendance to database:', error);
        } else {
          console.log(`Successfully saved ${userResponse} response for ${displayName} in database`);
        }
      } catch (err) {
        console.error('Unexpected error saving attendance:', err);
      }
    }

    // Update in-memory event data for Discord UI
    eventData.accepted = eventData.accepted.filter(entry =>
      typeof entry === 'string' ? entry !== user.username : entry.userId !== userId
    );
    eventData.declined = eventData.declined.filter(entry =>
      typeof entry === 'string' ? entry !== user.username : entry.userId !== userId
    );
    eventData.tentative = eventData.tentative.filter(entry =>
      typeof entry === 'string' ? entry !== user.username : entry.userId !== userId
    );

    const userEntry = { 
      userId, 
      displayName,
      boardNumber: pilotRecord?.boardNumber || '',
      callsign: pilotRecord?.callsign || displayName,
      pilotRecord
    };
    
    // Load existing responses from database before adding new one
    if (dbEvent) {
      try {
        const { data: existingAttendance, error: attendanceError } = await supabase
          .rpc('get_latest_event_responses', {
            event_id: eventId
          });
        
        if (!attendanceError && existingAttendance) {
          eventData.accepted = [];
          eventData.declined = [];
          eventData.tentative = [];

          // BATCH FETCHING OPTIMIZATION
          const discordIds = existingAttendance
            .filter(record => record.discord_id !== userId)
            .map(record => record.discord_id);

          if (discordIds.length > 0) {
            console.log(`[BATCH-FETCH] Fetching data for ${discordIds.length} users`);

            const { data: allPilots } = await supabase
              .from('pilots')
              .select(`
                *,
                pilot_qualifications(
                  qualification_id,
                  qualification:qualifications(name)
                )
              `)
              .in('discord_id', discordIds);

            const pilotsByDiscordId = new Map();
            const pilotIds = [];
            if (allPilots) {
              allPilots.forEach(pilot => {
                pilotsByDiscordId.set(pilot.discord_id, pilot);
                pilotIds.push(pilot.id);
              });
            }

            const { data: allAssignments } = await supabase
              .from('pilot_assignments')
              .select('pilot_id, squadron_id')
              .in('pilot_id', pilotIds)
              .is('end_date', null);

            const assignmentsByPilotId = new Map();
            const squadronIds = [];
            if (allAssignments) {
              allAssignments.forEach(assignment => {
                assignmentsByPilotId.set(assignment.pilot_id, assignment);
                if (assignment.squadron_id) {
                  squadronIds.push(assignment.squadron_id);
                }
              });
            }

            const { data: allSquadrons } = await supabase
              .from('org_squadrons')
              .select('id, designation, name, discord_integration')
              .in('id', squadronIds);

            const squadronById = new Map();
            if (allSquadrons) {
              allSquadrons.forEach(squadron => {
                squadronById.set(squadron.id, squadron);
              });
            }

            for (const record of existingAttendance) {
              if (record.discord_id === userId) {
                console.log(`[CURRENT-USER-SKIP] Skipping database reload for current user ${displayName}`);
                continue;
              }

              let pilotRecord = null;
              const pilotData = pilotsByDiscordId.get(record.discord_id);

              if (pilotData) {
                const assignment = assignmentsByPilotId.get(pilotData.id);
                const squadronData = assignment?.squadron_id ? squadronById.get(assignment.squadron_id) : null;

                pilotRecord = {
                  id: pilotData.id,
                  callsign: pilotData.callsign,
                  boardNumber: pilotData.boardNumber?.toString() || '',
                  qualifications: pilotData.pilot_qualifications?.map(pq => pq.qualification?.name).filter(Boolean) || [],
                  currentStatus: { name: pilotData.status || 'Provisional' },
                  squadron: squadronData || null
                };
              }

              const existingUserEntry = {
                userId: record.discord_id,
                displayName: record.discord_username || 'Unknown User',
                boardNumber: pilotRecord?.boardNumber || '',
                callsign: pilotRecord?.callsign || record.discord_username || 'Unknown User',
                pilotRecord
              };

              if (record.user_response === 'accepted') {
                eventData.accepted.push(existingUserEntry);
              } else if (record.user_response === 'declined') {
                eventData.declined.push(existingUserEntry);
              } else if (record.user_response === 'tentative') {
                eventData.tentative.push(existingUserEntry);
              }
            }
          }
        }
      } catch (error) {
        console.warn(`[RESPONSES-DEBUG] Error loading existing responses: ${error.message}`);
      }
    }
    
    // Add current user's response
    eventData.accepted = eventData.accepted.filter(u => u.userId !== userId);
    eventData.declined = eventData.declined.filter(u => u.userId !== userId);
    eventData.tentative = eventData.tentative.filter(u => u.userId !== userId);
    
    if (customId === 'accept') {
      eventData.accepted.push(userEntry);
    } else if (customId === 'decline') {
      eventData.declined.push(userEntry);
    } else if (customId === 'tentative') {
      eventData.tentative.push(userEntry);
    }

    // Fetch fresh event data and extract embed data
    let embedData = null;
    try {
      const { event: dbEvent } = await getEventByDiscordId(eventId);
      if (dbEvent) {
        const correctTimezone = await fetchSquadronTimezone(dbEvent.id);
        embedData = extractEmbedDataFromDatabaseEvent(dbEvent, correctTimezone);
      }
    } catch (error) {
      console.error('Error fetching embed data:', error);
    }
    
    if (!embedData) {
      embedData = {
        title: eventData.title,
        description: eventData.description,
        eventTime: eventData.eventTime,
        imageData: eventData.images || null,
        creatorInfo: eventData.creator || null,
        eventOptions: { trackQualifications: false, eventType: null, timezone: 'America/New_York' }
      };
    }
    
    const finalEventTime = freshEventTime;
    
    const updatedEmbed = createEventEmbed(
      embedData.title, 
      embedData.description, 
      finalEventTime,
      eventData,
      embedData.creatorInfo, 
      embedData.imageData, 
      embedData.eventOptions
    );
    
    const additionalEmbeds = createAdditionalImageEmbeds(embedData.imageData, 'https://readyroom.app');
    const allEmbeds = [updatedEmbed, ...additionalEmbeds];
    
    try {
      await interaction.editReply({
        embeds: allEmbeds,
        components: [createAttendanceButtons()]
      });
    } catch (error) {
      if (error.code === 40060) {
        console.warn(`[DISCORD-API] Interaction already acknowledged for user ${displayName} (${userId})`);
      } else if (error.code === 10062) {
        console.warn(`[DISCORD-API] Unknown interaction for user ${displayName} (${userId})`);
      } else if (error.message?.includes('timeout')) {
        console.warn(`[DISCORD-API] Interaction timeout for user ${displayName} (${userId})`);
      } else {
        console.error(`[DISCORD-API] Failed to update interaction:`, error);
      }
      
      console.log(`[DISCORD-API] Attendance response still recorded successfully for ${displayName} (${customId})`);
      return;
    }
    
    console.log(`${displayName} (${userId}) responded ${customId} to event: ${eventData.title}`);
  });
}

module.exports = {
  setupDiscordEventHandlers
};
