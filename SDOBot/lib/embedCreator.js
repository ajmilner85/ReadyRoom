/**
 * EMBED CREATOR MODULE
 * Handles Discord embed creation with NEW mission support separation
 */

const { EmbedBuilder } = require('discord.js');
const { formatDistanceToNow } = require('date-fns');
const { formatInTimeZone } = require('date-fns-tz');

/**
 * Create event message embed with NEW mission support separation
 */
async function createEventEmbed(title, description, eventTime, responses = {}, creator = null, images = null, eventOptions = {}) {
  // VERSION SENTINEL
  console.log(`[CODE-VERSION-SENTINEL] createEventEmbed v3.2 - Added Training Event Support`);
  console.log(`[CODE-VERSION-SENTINEL] Event: ${title}, trackQuals: ${eventOptions.trackQualifications}, groupSquad: ${eventOptions.groupBySquadron}, showNoResponse: ${eventOptions.showNoResponse}, isTraining: ${!!eventOptions.trainingData}`);

  const accepted = responses.accepted || [];
  const declined = responses.declined || [];
  const tentative = responses.tentative || [];
  const noResponse = responses.noResponse || [];
  
  // Helper function to format pilot entries
  const formatPilotEntry = (entry) => {
    if (typeof entry === 'string') return entry;
    if (entry.pilotRecord) {
      const boardNumber = entry.pilotRecord.boardNumber || '';
      const callsign = entry.pilotRecord.callsign || '';
      return boardNumber ? `${boardNumber} ${callsign}` : callsign;
    }
    const boardNumber = entry.boardNumber || '';
    const callsign = entry.callsign || entry.displayName || 'Unknown';
    return boardNumber ? `${boardNumber} ${callsign}` : callsign;
  };

  // Helper function to create block quote format
  const createBlockQuote = (entries) => {
    if (entries.length === 0) return '-';
    const formattedEntries = entries.map(formatPilotEntry);
    const content = formattedEntries.map(entry => `> ${entry}`).join('\n');
    return content.length > 1020 ? formattedEntries.slice(0, 20).map(entry => `> ${entry}`).join('\n') + `\n> ... and ${formattedEntries.length - 20} more` : content;
  };
  
  // MODIFIED: groupByQualifications - now returns structured data for accepted only
  const groupByQualifications = (entries, isTraining = false, trainingEnrollees = []) => {
    if (entries.length === 0) return { flightLead: [], sectionLead: [], wingman: [] };

    if (isTraining) {
      // For training events, group by: Trainee, IP, Other Participants
      const traineeIds = new Set(trainingEnrollees.map(e => e.pilot_id));

      const trainees = entries.filter(entry => {
        const pilotId = entry.pilotRecord?.id;
        return pilotId && traineeIds.has(pilotId);
      });

      const ips = entries.filter(entry => {
        const qualifications = entry.pilotRecord?.qualifications || [];
        const pilotId = entry.pilotRecord?.id;
        return qualifications.includes('Instructor Pilot') && (!pilotId || !traineeIds.has(pilotId));
      });

      const traineeIdSet = new Set(trainees.map(t => t.userId || t.discordId));
      const ipIdSet = new Set(ips.map(ip => ip.userId || ip.discordId));
      const otherParticipants = entries.filter(entry => {
        const id = entry.userId || entry.discordId;
        return !traineeIdSet.has(id) && !ipIdSet.has(id);
      });

      return { trainees, ips, otherParticipants };
    }
    
    // Standard grouping - PRIMARY qualifications only
    const primaryQualifications = ['Flight Lead', 'Section Lead'];
    const primaryGroups = { 'Flight Lead': [], 'Section Lead': [], 'Wingman': [] };

    entries.forEach(entry => {
      let assignedToPrimary = false;
      const qualifications = entry.pilotRecord?.qualifications || [];

      for (const qual of primaryQualifications) {
        if (qualifications.includes(qual)) {
          primaryGroups[qual].push(entry);
          assignedToPrimary = true;
          break;
        }
      }

      if (!assignedToPrimary) {
        primaryGroups['Wingman'].push(entry);
      }
    });

    return {
      flightLead: primaryGroups['Flight Lead'],
      sectionLead: primaryGroups['Section Lead'],
      wingman: primaryGroups['Wingman']
    };
  };

  // NEW: Format qualification group as text with block quote (Apollo style)
  const formatQualGroup = (pilots) => {
    if (pilots.length === 0) return '>>> -';
    
    // Format as: >>> Pilot1\nPilot2\nPilot3 (Apollo uses >>> at start for entire block)
    const pilotLines = pilots.map(formatPilotEntry).join('\n');
    return `>>> ${pilotLines}`;
  };

  // MODIFIED: Mission Support Section Generator - ONLY accepted pilots with >>> block quote
  const generateMissionSupportSection = (entries) => {
    console.log(`[MISSION-SUPPORT-SENTINEL] generateMissionSupportSection called with ${entries.length} entries`);
    
    const auxiliaryQualifications = ['Mission Commander', 'JTAC', 'Landing Signals Officer'];
    const supportMap = new Map();

    auxiliaryQualifications.forEach(qual => supportMap.set(qual, []));

    entries.forEach(entry => {
      const qualifications = entry.pilotRecord?.qualifications || [];
      
      auxiliaryQualifications.forEach(qual => {
        if (qualifications.includes(qual)) {
          console.log(`[MISSION-SUPPORT-SENTINEL] Adding ${entry.displayName} to ${qual}`);
          supportMap.get(qual).push(entry);
        }
      });
    });

    const hasSupportPilots = Array.from(supportMap.values()).some(arr => arr.length > 0);
    
    if (!hasSupportPilots) {
      return '';
    }

    const columns = [[], [], []];
    let currentColumn = 0;

    const displayNames = {
      'Mission Commander': 'Mission Commander',
      'JTAC': 'JTAC',
      'Landing Signals Officer': 'LSO'
    };

    auxiliaryQualifications.forEach(qual => {
      const qualPilots = supportMap.get(qual) || [];
      if (qualPilots.length > 0) {
        const displayName = displayNames[qual] || qual;
        // Use >>> block quote format like qualification groups
        const pilotLines = qualPilots.map(formatPilotEntry).join('\n');
        const qualSection = `>>> ${pilotLines}`;
        const qualName = `*${displayName} (${qualPilots.length})*`;
        columns[currentColumn].push({ name: qualName, value: qualSection });
        currentColumn = (currentColumn + 1) % 3;
      }
    });

    return { columns, hasSupportPilots: true };
  };

  // Helper to organize by squadron
  const organizeBySquadron = (accepted, tentative, declined) => {
    const squadronMap = {};
    const allEntries = [...accepted, ...tentative, ...declined];

    allEntries.forEach(entry => {
      const squadron = entry.pilotRecord?.squadron;
      if (squadron && squadron.id) {
        if (!squadronMap[squadron.id]) {
          squadronMap[squadron.id] = { squadron, accepted: [], tentative: [], declined: [] };
        }
      }
    });

    const hasNoSquadron = allEntries.some(entry => !entry.pilotRecord?.squadron?.id);
    if (hasNoSquadron) {
      squadronMap['no-squadron'] = { squadron: null, accepted: [], tentative: [], declined: [] };
    }

    accepted.forEach(entry => {
      const squadronId = entry.pilotRecord?.squadron?.id || 'no-squadron';
      if (squadronMap[squadronId]) squadronMap[squadronId].accepted.push(entry);
    });

    tentative.forEach(entry => {
      const squadronId = entry.pilotRecord?.squadron?.id || 'no-squadron';
      if (squadronMap[squadronId]) squadronMap[squadronId].tentative.push(entry);
    });

    declined.forEach(entry => {
      const squadronId = entry.pilotRecord?.squadron?.id || 'no-squadron';
      if (squadronMap[squadronId]) squadronMap[squadronId].declined.push(entry);
    });

    return Object.values(squadronMap);
  };

  const shouldTrackQualifications = eventOptions.trackQualifications || false;
  const shouldGroupBySquadron = eventOptions.groupBySquadron || false;
  const isTrainingEvent = !!eventOptions.trainingData;
  const trainingEnrollees = eventOptions.trainingData?.enrollees || [];

  console.log(`[EVENT-TYPE-DEBUG] Event "${title}": eventType=${eventOptions.eventType}, isTrainingEvent=${isTrainingEvent}, shouldTrackQualifications=${shouldTrackQualifications}, shouldGroupBySquadron=${shouldGroupBySquadron}`);

  // Create embed
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(title);

  // Add training metadata if this is a training event
  let fullDescription = description || '';
  if (isTrainingEvent && eventOptions.trainingData) {
    const td = eventOptions.trainingData;
    let trainingMetadata = '';

    // Add syllabus/week/mission heading
    if (td.syllabusName || td.weekNumber !== undefined || td.missionName) {
      const weekDisplay = td.weekNumber !== null && td.weekNumber !== undefined ? td.weekNumber : '?';
      trainingMetadata += `**${td.syllabusName || 'Training'} Week ${weekDisplay} - ${td.missionName || 'Mission'}**\n\n`;
    }

    // Add description if present
    if (description) {
      trainingMetadata += `**Description:**\n${description}\n\n`;
    }

    // Add DLOs if present
    if (td.dlos && td.dlos.length > 0) {
      trainingMetadata += `**Desired Learning Objectives:**\n`;
      td.dlos.forEach(dlo => {
        trainingMetadata += `• ${dlo.objective_text}\n`;
      });
      trainingMetadata += `\n`;
    }

    // Add reference materials if present
    if (td.referenceMaterials && td.referenceMaterials.length > 0) {
      trainingMetadata += `**Reference Materials:**\n`;
      trainingMetadata += `>>> `;
      td.referenceMaterials.forEach((ref, index) => {
        const docType = ref.type || 'Document';
        const docName = ref.name || ref.title || 'Untitled';
        if (index > 0) trainingMetadata += '\n';
        if (ref.url || ref.link) {
          trainingMetadata += `*${docType}*: [${docName}](${ref.url || ref.link})`;
        } else {
          trainingMetadata += `*${docType}*: ${docName}`;
        }
      });
      trainingMetadata += `\n\n`;  // Close the block quote
    }

    // Set full description to just the training metadata (description already included above)
    fullDescription = trainingMetadata;
  }

  if (fullDescription && fullDescription.trim().length > 0) {
    // Discord has a 4096 character limit for descriptions
    const maxLength = 4090;
    if (fullDescription.length > maxLength) {
      fullDescription = fullDescription.substring(0, maxLength) + '...';
    }
    embed.setDescription(fullDescription);
  }

  // Add spacing field if this is a training event (creates visual gap between description and Event Time)
  if (isTrainingEvent && eventOptions.trainingData && (eventOptions.trainingData.dlos?.length > 0 || eventOptions.trainingData.referenceMaterials?.length > 0)) {
    embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
  }

  // Add event time if provided
  if (eventTime) {
    const startTime = eventTime.start;
    const endTime = eventTime.end;
    const eventTimezone = eventOptions?.timezone || 'America/New_York';

    const formattedDate = formatInTimeZone(startTime, eventTimezone, "EEEE, MMMM d, yyyy");
    const formattedStartTime = formatInTimeZone(startTime, eventTimezone, "h:mm a zzz");
    const formattedEndTime = formatInTimeZone(endTime, eventTimezone, "h:mm a zzz");

    const timeString = `${formattedDate} ${formattedStartTime} - ${formattedEndTime}`;

    const nowUtc = new Date();
    let countdownString;
    
    if (nowUtc >= startTime && nowUtc <= endTime) {
      countdownString = '🔴 **Happening Now**';
    } else if (nowUtc > endTime) {
      countdownString = '⏹️ **Event Finished**';
    } else {
      countdownString = `🕒 ${formatDistanceToNow(startTime, { addSuffix: true })}`;
    }
    
    const googleCalendarLink = createGoogleCalendarLink(title, description, startTime, endTime);
    
    embed.addFields(
      { name: '📆 Event Time', value: timeString, inline: false },
      { name: 'Countdown', value: countdownString, inline: true },
      { name: 'Add to Calendar', value: `[Google Calendar](${googleCalendarLink})`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '\u200B', value: '\u200B', inline: false } // Add spacing row after countdown/calendar
    );
  }

  // NEW STRUCTURE: Build attendance fields
  
  // Check if there are no responses at all
  const hasNoResponses = accepted.length === 0 && tentative.length === 0 && declined.length === 0;
  const shouldShowNoResponse = eventOptions.showNoResponse && noResponse.length > 0;

  if (hasNoResponses && !shouldShowNoResponse) {
    // Add placeholder text when no responses have been recorded yet AND showNoResponse is disabled or has no users
    embed.addFields(
      { name: '\u200B', value: '*No Responses Recorded Yet*', inline: false }
    );
  } else if (shouldGroupBySquadron) {
    console.log(`[EMBED-STRUCTURE] Building with squadron grouping`);

    if (isTrainingEvent) {
      // Training events: Trainee and IP are squadron-agnostic, only Other Participants are grouped by squadron
      console.log(`[EMBED-STRUCTURE] Training event with squadron grouping - Trainees/IPs squadron-agnostic`);

      const grouped = groupByQualifications(accepted, isTrainingEvent, trainingEnrollees);

      // Row 1: Trainee | IP (squadron-agnostic)
      const traineeText = formatQualGroup(grouped.trainees || []);
      const ipText = formatQualGroup(grouped.ips || []);

      embed.addFields(
        { name: `<:SkyHawk:1244846070526115972> *Trainee (${(grouped.trainees || []).length})*`, value: traineeText, inline: true },
        { name: `<:Hornet:541484781515440128> *IP (${(grouped.ips || []).length})*`, value: ipText, inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      );

      // Row 2+: Other Participants grouped by squadron (3 per row)
      if (grouped.otherParticipants && grouped.otherParticipants.length > 0) {
        const otherBySquadron = {};
        grouped.otherParticipants.forEach(entry => {
          const squadronId = entry.pilotRecord?.squadron?.id || 'no-squadron';
          const squadron = entry.pilotRecord?.squadron;

          if (!otherBySquadron[squadronId]) {
            otherBySquadron[squadronId] = { squadron, pilots: [] };
          }
          otherBySquadron[squadronId].pilots.push(entry);
        });

        // Create rows of 3 squadrons each
        const squadronEntries = Object.values(otherBySquadron);
        for (let i = 0; i < squadronEntries.length; i += 3) {
          const row = squadronEntries.slice(i, i + 3);
          const fields = row.map((squadEntry) => {
            const { squadron, pilots } = squadEntry;

            let squadronHeader;
            if (squadron) {
              let discordIntegration = squadron.discord_integration;
              if (typeof discordIntegration === 'string') {
                try {
                  discordIntegration = JSON.parse(discordIntegration);
                } catch (e) {
                  console.warn(`[EMOJI-DEBUG] Failed to parse discord_integration`);
                }
              }

              const emojiData = discordIntegration?.emoji;
              let emojiString = '';

              if (emojiData) {
                if (typeof emojiData === 'string') {
                  if (emojiData.startsWith(':') && emojiData.includes(':')) {
                    emojiString = `<${emojiData}> `;
                  } else {
                    emojiString = `${emojiData} `;
                  }
                } else if (emojiData.id && emojiData.name) {
                  const animated = emojiData.animated ? 'a' : '';
                  emojiString = `<${animated}:${emojiData.name}:${emojiData.id}> `;
                }
              }

              squadronHeader = `${emojiString}${squadron.designation}`;
            } else {
              squadronHeader = 'No Squadron';
            }

            return {
              name: `*${squadronHeader} (${pilots.length})*`,
              value: formatQualGroup(pilots),
              inline: true
            };
          });

          // Pad to 3 columns
          while (fields.length < 3) {
            fields.push({ name: '\u200B', value: '\u200B', inline: true });
          }

          embed.addFields(...fields);
        }
      }

      // Add Mission Support section for training events (after Other Participants)
      if (shouldTrackQualifications) {
        const missionSupportResult = generateMissionSupportSection(accepted);

        if (missionSupportResult && missionSupportResult.hasSupportPilots) {
          const { columns } = missionSupportResult;

          // Build fields with proper alignment
          const fields = columns.flatMap((column, colIndex) => {
            if (column.length > 0) {
              return column.map((field, fieldIndex) => {
                // Add header to first field of first column, empty space to others
                let fieldName = field.name;
                if (colIndex === 0 && fieldIndex === 0) {
                  fieldName = `<:awacs:1229253561528090664> **Mission Support**\n${field.name}`;
                } else if (fieldIndex === 0 && colIndex > 0) {
                  fieldName = `\u200B\n${field.name}`;
                }
                return { name: fieldName, value: field.value, inline: true };
              });
            } else {
              // Empty column with matching spacing
              return [{ name: colIndex === 0 ? `<:awacs:1229253561528090664> **Mission Support**\n\u200B` : `\u200B\n\u200B`, value: '>>> -', inline: true }];
            }
          });

          embed.addFields(...fields);
        }
      }
    } else {
      // Regular (non-training) events with squadron grouping
      const squadronGroups = organizeBySquadron(accepted, tentative, declined);

      // Add each squadron's ACCEPTED pilots only
      squadronGroups.forEach(group => {
        const { squadron } = group;

        // DEFENSIVE: Always render squadrons if they have ANY responses (accepted, tentative, declined)
        // This prevents squadrons from disappearing during countdown updates if data fetch is incomplete
        const hasAnyResponses = group.accepted.length > 0 || group.tentative.length > 0 || group.declined.length > 0;

        if (!hasAnyResponses) {
          console.log(`[EMBED-SQUADRON-SKIP] Skipping squadron ${squadron?.designation || 'unknown'} - no responses at all`);
          return; // Only skip if squadron has NO responses whatsoever
        }

        if (group.accepted.length === 0) {
          console.log(`[EMBED-SQUADRON-WARN] Squadron ${squadron?.designation || 'unknown'} has ${group.tentative.length} tentative and ${group.declined.length} declined but NO accepted pilots - still rendering to prevent disappearance`);
        }

        const acceptedCount = group.accepted.length;

        let squadronHeader;
        if (squadron) {
          let discordIntegration = squadron.discord_integration;
          if (typeof discordIntegration === 'string') {
            try {
              discordIntegration = JSON.parse(discordIntegration);
            } catch (e) {
              console.warn(`[EMOJI-DEBUG] Failed to parse discord_integration for ${squadron.designation}`);
            }
          }

          const emojiData = discordIntegration?.emoji;
          let emojiString = '';

          if (emojiData) {
            if (typeof emojiData === 'string') {
              if (emojiData.startsWith(':') && emojiData.includes(':')) {
                emojiString = `<${emojiData}> `;
              } else {
                emojiString = `${emojiData} `;
              }
            } else if (emojiData.id && emojiData.name) {
              const animated = emojiData.animated ? 'a' : '';
              emojiString = `<${animated}:${emojiData.name}:${emojiData.id}> `;
            }
          }

          squadronHeader = `${emojiString}**${squadron.designation}** *(${acceptedCount})*`;
        } else {
          squadronHeader = `**No Squadron** *(${acceptedCount})*`;
        }

        if (shouldTrackQualifications) {
          // Regular event: Show Flight Lead | Section Lead | Wingman columns
          const grouped = groupByQualifications(group.accepted, isTrainingEvent, trainingEnrollees);

          const flText = formatQualGroup(grouped.flightLead || []);
          const slText = formatQualGroup(grouped.sectionLead || []);
          const wmText = formatQualGroup(grouped.wingman || []);

          embed.addFields(
            { name: `${squadronHeader}\n*Flight Lead (${(grouped.flightLead || []).length})*`, value: flText, inline: true },
            { name: `\u200B\n*Section Lead (${(grouped.sectionLead || []).length})*`, value: slText, inline: true },
            { name: `\u200B\n*Wingman (${(grouped.wingman || []).length})*`, value: wmText, inline: true }
          );
        } else {
          // Show all pilots without qualification grouping
          const allPilots = createBlockQuote(group.accepted);
          embed.addFields(
            { name: squadronHeader, value: allPilots, inline: false }
          );
        }
      });

      // Add Mission Support section (ONLY accepted pilots)
      if (shouldTrackQualifications) {
        const missionSupportResult = generateMissionSupportSection(accepted);

        if (missionSupportResult && missionSupportResult.hasSupportPilots) {
          const { columns } = missionSupportResult;

          // Build fields with proper alignment
          const fields = columns.flatMap((column, colIndex) => {
            if (column.length > 0) {
              return column.map((field, fieldIndex) => {
                // Add header to first field of first column, empty space to others
                let fieldName = field.name;
                if (colIndex === 0 && fieldIndex === 0) {
                  fieldName = `<:awacs:1229253561528090664> **Mission Support**\n${field.name}`;
                } else if (fieldIndex === 0 && colIndex > 0) {
                  fieldName = `\u200B\n${field.name}`;
                }
                return { name: fieldName, value: field.value, inline: true };
              });
            } else {
              // Empty column with matching spacing
              return [{ name: colIndex === 0 ? `<:awacs:1229253561528090664> **Mission Support**\n\u200B` : `\u200B\n\u200B`, value: '>>> -', inline: true }];
            }
          });

          embed.addFields(...fields);
        }
      }
    }

    // Add Tentative, Declined, and No Response sections at the end (in 3-column layout if showNoResponse)
    if (shouldShowNoResponse) {
      // Use 3-column layout: Tentative | Declined | No Response
      const tentativeText = tentative.length > 0 ? createBlockQuote(tentative) : '-';
      const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
      const noResponseText = createBlockQuote(noResponse);

      embed.addFields(
        { name: `❓ **Tentative** (${tentative.length})`, value: tentativeText, inline: true },
        { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: true },
        { name: `⏳ **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
      );
    } else {
      // Use original layout without No Response
      if (tentative.length > 0) {
        const tentativeText = createBlockQuote(tentative);
        embed.addFields(
          { name: `❓ **Tentative** (${tentative.length})`, value: tentativeText, inline: false }
        );
      }

      if (declined.length > 0) {
        const declinedText = createBlockQuote(declined);
        embed.addFields(
          { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: false }
        );
      }
    }
  } else {
    // No squadron grouping
    console.log(`[EMBED-STRUCTURE] Building without squadron grouping`);

    // REMOVED: Attending header

    if (shouldTrackQualifications) {
      if (isTrainingEvent) {
        // Training event: Show Trainee | IP columns
        const grouped = groupByQualifications(accepted, isTrainingEvent, trainingEnrollees);

        const traineeText = formatQualGroup(grouped.trainees || []);
        const ipText = formatQualGroup(grouped.ips || []);

        embed.addFields(
          { name: '<:SkyHawk:1244846070526115972> *Trainee (' + (grouped.trainees || []).length + ')*', value: traineeText, inline: true },
          { name: '<:Hornet:541484781515440128> *IP (' + (grouped.ips || []).length + ')*', value: ipText, inline: true },
          { name: '\u200B', value: '\u200B', inline: true }
        );

        // Other Participants - show with heading only if squadron grouping is disabled
        if (grouped.otherParticipants && grouped.otherParticipants.length > 0) {
          const otherText = formatQualGroup(grouped.otherParticipants);
          embed.addFields(
            { name: `**Other Participants** (${grouped.otherParticipants.length})`, value: otherText, inline: false }
          );
        }
      } else {
        // Regular event: Show Flight Lead | Section Lead | Wingman columns
        const grouped = groupByQualifications(accepted, isTrainingEvent, trainingEnrollees);

        const flText = formatQualGroup(grouped.flightLead);
        const slText = formatQualGroup(grouped.sectionLead);
        const wmText = formatQualGroup(grouped.wingman);

        embed.addFields(
          { name: '*Flight Lead (' + grouped.flightLead.length + ')*', value: flText, inline: true },
          { name: '*Section Lead (' + grouped.sectionLead.length + ')*', value: slText, inline: true },
          { name: '*Wingman (' + grouped.wingman.length + ')*', value: wmText, inline: true }
        );
      }

      // Add Mission Support section (ONLY accepted pilots)
      {
        const missionSupportResult = generateMissionSupportSection(accepted);

        if (missionSupportResult && missionSupportResult.hasSupportPilots) {
          const { columns } = missionSupportResult;

          // Build field array dynamically
          const missionSupportFields = [];
          columns.forEach((column, index) => {
            if (column.length > 0) {
              column.forEach(field => {
                missionSupportFields.push({ name: field.name, value: field.value, inline: true });
              });
            } else {
              // Empty column
              missionSupportFields.push({ name: '\u200B', value: '>>> -', inline: true });
            }
          });

          // Add header in first field
          if (missionSupportFields.length > 0) {
            missionSupportFields[0].name = `<:awacs:1229253561528090664> **Mission Support**\n${missionSupportFields[0].name}`;
          }

          embed.addFields(...missionSupportFields);
        }
      }
    } else {
      // Show all accepted pilots without grouping
      const acceptedText = accepted.length > 0 ? createBlockQuote(accepted) : '-';
      embed.addFields(
        { name: 'All Pilots', value: acceptedText, inline: false }
      );
    }

    // Add Tentative, Declined, and No Response sections at the end (in 3-column layout if showNoResponse)

    if (shouldShowNoResponse) {
      // Use 3-column layout: Tentative | Declined | No Response
      const tentativeText = tentative.length > 0 ? createBlockQuote(tentative) : '-';
      const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
      const noResponseText = createBlockQuote(noResponse);

      embed.addFields(
        { name: `❓ **Tentative** (${tentative.length})`, value: tentativeText, inline: true },
        { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: true },
        { name: `⏳ **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
      );
    } else {
      // Use original layout without No Response
      if (tentative.length > 0) {
        const tentativeText = createBlockQuote(tentative);
        embed.addFields(
          { name: `❓ **Tentative** (${tentative.length})`, value: tentativeText, inline: false }
        );
      }

      if (declined.length > 0) {
        const declinedText = createBlockQuote(declined);
        embed.addFields(
          { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: false }
        );
      }
    }
  }

  // Footer
  const MAX_EMBED_WIDTH = 164;
  
  if (creator) {
    let footerText = '';
    if (creator.boardNumber) footerText += creator.boardNumber + ' ';
    if (creator.callsign) footerText += creator.callsign;
    if (creator.billet) footerText += ' - ' + creator.billet;
    
    if (footerText) {
      embed.setFooter({ text: `Created by ${footerText}`.padEnd(MAX_EMBED_WIDTH) + '\u200B' });
    } else {
      embed.setFooter({ text: 'ReadyRoom Event'.padEnd(MAX_EMBED_WIDTH) + '\u200B' });
    }
  } else {
    embed.setFooter({ text: 'ReadyRoom Event'.padEnd(MAX_EMBED_WIDTH) + '\u200B' });
  }
  
  // Header image
  if (images) {
    if (images.headerImage && typeof images.headerImage === 'string') {
      embed.setImage(images.headerImage);
    } else if (images.imageUrl && typeof images.imageUrl === 'string') {
      embed.setImage(images.imageUrl);
    }
  }
  
  return embed;
}

// Helper: Create additional image embeds
function createAdditionalImageEmbeds(images, mainEmbedUrl = 'https://readyroom.app') {
  const embeds = [];
  
  if (images && images.additionalImages && Array.isArray(images.additionalImages)) {
    images.additionalImages.forEach((imageUrl) => {
      if (imageUrl) {
        const imageEmbed = new EmbedBuilder()
          .setURL(mainEmbedUrl)
          .setImage(imageUrl)
          .setColor(0x0099FF);
        embeds.push(imageEmbed);
      }
    });
  }
  
  return embeds;
}

// Helper: Create Google Calendar link
function createGoogleCalendarLink(title, description, startTime, endTime) {
  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description);
  
  const formatDateForCalendar = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
  };
  
  const startTimeFormatted = formatDateForCalendar(startTime);
  const endTimeFormatted = formatDateForCalendar(endTime);
  
  console.log(`[CALENDAR-LINK-DEBUG] Original times: start=${startTime}, end=${endTime}`);
  console.log(`[CALENDAR-LINK-DEBUG] Formatted for calendar: start=${startTimeFormatted}, end=${endTimeFormatted}`);
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&details=${encodedDescription}&dates=${startTimeFormatted}/${endTimeFormatted}`;
}

module.exports = {
  createEventEmbed,
  createAdditionalImageEmbeds,
  createGoogleCalendarLink
};