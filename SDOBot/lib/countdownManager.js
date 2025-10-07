/**
 * COUNTDOWN MANAGER MODULE
 * Handles automatic countdown updates for Discord event messages
 */

const { formatInTimeZone } = require('date-fns-tz');
const { createEventEmbed, createAdditionalImageEmbeds } = require('./embedCreator');
const { getClient, ensureLoggedIn } = require('./discordClient');

class CountdownUpdateManager {
  constructor(supabase, getEventByDiscordId, fetchSquadronTimezone, extractEmbedDataFromDatabaseEvent) {
    this.updateTimeouts = new Map();
    this.isRunning = false;
    this.supabase = supabase;
    this.getEventByDiscordId = getEventByDiscordId;
    this.fetchSquadronTimezone = fetchSquadronTimezone;
    this.extractEmbedDataFromDatabaseEvent = extractEmbedDataFromDatabaseEvent;
  }

  async calculateUpdateInterval(eventStartTime, referenceTimezone = 'America/New_York') {
    try {
      const nowUtc = new Date();
      const eventStartUtc = new Date(eventStartTime);
      
      const timeUntilEvent = eventStartUtc.getTime() - nowUtc.getTime();
      const hoursUntil = timeUntilEvent / (1000 * 60 * 60);

      const nowInTimezone = formatInTimeZone(nowUtc, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");
      const eventInTimezone = formatInTimeZone(eventStartUtc, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");

      if (hoursUntil <= 0) {
        return null;
      } else if (hoursUntil <= 1) {
        return 1 * 60 * 1000; // 1 minute
      } else if (hoursUntil <= 6) {
        return 15 * 60 * 1000; // 15 minutes
      } else if (hoursUntil <= 24) {
        return 60 * 60 * 1000; // 1 hour
      } else {
        return 24 * 60 * 60 * 1000; // 24 hours
      }
    } catch (error) {
      console.error(`[COUNTDOWN] Error calculating update interval: ${error.message}`);
      const now = new Date();
      const timeUntilEvent = new Date(eventStartTime) - now;
      const hoursUntil = timeUntilEvent / (1000 * 60 * 60);
      
      if (hoursUntil <= 0) return null;
      else if (hoursUntil <= 1) return 1 * 60 * 1000;
      else if (hoursUntil <= 6) return 15 * 60 * 1000;
      else if (hoursUntil <= 24) return 60 * 60 * 1000;
      else return 24 * 60 * 60 * 1000;
    }
  }

  async scheduleEventUpdate(eventData, messageId, guildId, channelId, referenceTimezone = 'America/New_York') {
    if (this.updateTimeouts.has(messageId)) {
      clearTimeout(this.updateTimeouts.get(messageId));
    }

    const startTime = new Date(eventData.start_datetime);
    const endTime = new Date(eventData.end_datetime || eventData.end_time);

    const nowUtc = new Date();
    
    if (nowUtc > endTime) {
      const nowInTimezone = formatInTimeZone(nowUtc, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");
      const endTimeInTimezone = formatInTimeZone(endTime, referenceTimezone, "yyyy-MM-dd HH:mm:ss zzz");
      console.log(`[COUNTDOWN] Event ${messageId} has finished (now: ${nowInTimezone} > end: ${endTimeInTimezone}), not scheduling updates`);
      return;
    }

    const updateInterval = await this.calculateUpdateInterval(startTime, referenceTimezone);
    
    if (!updateInterval) {
      console.log(`[COUNTDOWN] Event ${messageId} has started, stopping countdown updates`);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        let freshEventData = eventData;
        try {
          const { event: dbEvent } = await this.getEventByDiscordId(messageId);
          if (dbEvent) {
            freshEventData = dbEvent;
          }
        } catch (fetchError) {
          console.warn(`[COUNTDOWN] Error fetching fresh event data for ${messageId}:`, fetchError.message);
        }
        
        await this.updateEventCountdown(freshEventData, messageId, guildId, channelId, referenceTimezone);
        this.scheduleEventUpdate(freshEventData, messageId, guildId, channelId, referenceTimezone);
      } catch (error) {
        console.error(`[COUNTDOWN] Error updating event ${messageId}:`, error);
      }
    }, updateInterval);

    this.updateTimeouts.set(messageId, timeoutId);
  }

  async updateEventCountdown(eventData, messageId, guildId, channelId) {
    try {
      await ensureLoggedIn();

      const client = getClient();
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.error(`[COUNTDOWN] Guild ${guildId} not found`);
        return;
      }

      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        console.error(`[COUNTDOWN] Channel ${channelId} not found in guild ${guildId}`);
        return;
      }

      try {
        const message = await channel.messages.fetch(messageId);
        if (!message) {
          console.error(`[COUNTDOWN] Message ${messageId} not found`);
          return;
        }

        // Get existing responses from database
        let currentResponses = { accepted: [], declined: [], tentative: [] };
        
        try {
          const { data: attendanceData, error: attendanceError } = await this.supabase
            .rpc('get_latest_event_responses', {
              event_id: messageId
            });
          
          if (!attendanceError && attendanceData) {
            const discordIds = attendanceData.map(record => record.discord_id);
            console.log(`[COUNTDOWN-BATCH-FETCH] Fetching data for ${discordIds.length} users`);

            const { data: allPilots } = await this.supabase
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

            const { data: allAssignments } = await this.supabase
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

            const { data: allSquadrons } = await this.supabase
              .from('org_squadrons')
              .select('id, designation, name, discord_integration')
              .in('id', squadronIds);

            const squadronById = new Map();
            if (allSquadrons) {
              allSquadrons.forEach(squadron => {
                squadronById.set(squadron.id, squadron);
              });
            }

            console.log(`[COUNTDOWN-BATCH-FETCH] Fetched ${allPilots?.length || 0} pilots, ${allAssignments?.length || 0} assignments, ${allSquadrons?.length || 0} squadrons`);

            for (const record of attendanceData) {
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

              const userEntry = {
                userId: record.discord_id,
                displayName: record.discord_username || 'Unknown User',
                boardNumber: pilotRecord?.boardNumber || '',
                callsign: pilotRecord?.callsign || record.discord_username || 'Unknown User',
                pilotRecord
              };

              if (record.user_response === 'accepted') {
                currentResponses.accepted.push(userEntry);
              } else if (record.user_response === 'declined') {
                currentResponses.declined.push(userEntry);
              } else if (record.user_response === 'tentative') {
                currentResponses.tentative.push(userEntry);
              }
            }
            
            console.log(`[COUNTDOWN-RESPONSES] Restored ${attendanceData.length} responses from database with pilot data for event ${messageId}`);
          }
        } catch (dbError) {
          console.warn(`[COUNTDOWN-RESPONSES] Error fetching responses from database:`, dbError);
        }

        // Extract embed data
        const correctTimezone = await this.fetchSquadronTimezone(eventData.id);
        const embedData = this.extractEmbedDataFromDatabaseEvent(eventData, correctTimezone);
        console.log(`[COUNTDOWN-TIMEZONE-FIX] Using timezone ${correctTimezone} for event ${eventData.id}`);
        
        const updatedEmbed = createEventEmbed(
          embedData.title,
          embedData.description,
          embedData.eventTime,
          currentResponses,
          embedData.creatorInfo,
          embedData.imageData,
          embedData.eventOptions
        );

        const additionalEmbeds = createAdditionalImageEmbeds(embedData.imageData, 'https://readyroom.app');
        const allEmbeds = [updatedEmbed, ...additionalEmbeds];

        await message.edit({
          embeds: allEmbeds,
          components: message.components
        });

      } catch (fetchError) {
        if (fetchError.code === 10008) {
          this.clearEventUpdate(messageId);
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      console.error(`[COUNTDOWN] Error updating countdown for event ${messageId}:`, error);
    }
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('[COUNTDOWN] Starting countdown update manager');

    try {
      let referenceTimezone = 'America/New_York';
      
      try {
        const { data: squadronData } = await this.supabase
          .from('org_squadrons')
          .select('settings')
          .limit(1)
          .single();
        
        if (squadronData?.settings?.referenceTimezone) {
          referenceTimezone = squadronData.settings.referenceTimezone;
        }
      } catch (tzError) {
        console.warn(`[COUNTDOWN] Error getting timezone setting, using default: ${tzError.message}`);
      }

      const { data: events, error } = await this.supabase
        .from('events')
        .select('*')
        .not('discord_event_id', 'is', null)
        .gte('end_datetime', new Date().toISOString());

      if (error) {
        console.error('[COUNTDOWN] Error loading events:', error);
        return;
      }

      for (const event of events) {
        if (!event.discord_event_id) continue;

        let messageIds = [];
        if (typeof event.discord_event_id === 'string') {
          messageIds = [{ messageId: event.discord_event_id, guildId: null }];
        } else if (Array.isArray(event.discord_event_id)) {
          messageIds = event.discord_event_id.filter(entry => entry.messageId);
        }

        for (const { messageId, guildId, channelId } of messageIds) {
          if (messageId) {
            this.scheduleEventUpdate(event, messageId, guildId, channelId, referenceTimezone);
          }
        }
      }

    } catch (error) {
      console.error('[COUNTDOWN] Error starting countdown manager:', error);
    }
  }

  stop() {
    console.log('[COUNTDOWN] Stopping countdown update manager');
    this.isRunning = false;
    
    for (const [messageId, timeoutId] of this.updateTimeouts) {
      clearTimeout(timeoutId);
    }
    this.updateTimeouts.clear();
  }

  clearEventUpdate(messageId) {
    if (this.updateTimeouts.has(messageId)) {
      clearTimeout(this.updateTimeouts.get(messageId));
      this.updateTimeouts.delete(messageId);
    }
  }

  addEventToSchedule(eventData, messageId, guildId, channelId) {
    if (this.isRunning) {
      this.scheduleEventUpdate(eventData, messageId, guildId, channelId);
    }
  }
}

module.exports = {
  CountdownUpdateManager
};
