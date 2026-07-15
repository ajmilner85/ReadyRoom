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
  console.log(`[CODE-VERSION-SENTINEL] createEventEmbed v3.3 - Configurable Mission Support role requirements`);
  console.log(`[CODE-VERSION-SENTINEL] Event: ${title}, trackQuals: ${eventOptions.trackQualifications}, groupSquad: ${eventOptions.groupBySquadron}, showNoResponse: ${eventOptions.showNoResponse}, allowTentative: ${eventOptions.allowTentativeResponse ?? true}, isTraining: ${!!eventOptions.trainingData}`);

  const accepted = responses.accepted || [];
  const declined = responses.declined || [];
  const tentative = responses.tentative || [];
  const noResponse = responses.noResponse || [];
  const allowTentative = eventOptions.allowTentativeResponse ?? true;
  
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

  // Helper function to sort pilots by board number (lowest to highest), no-board pilots at end
  const sortByBoardNumber = (entries) => {
    return [...entries].sort((a, b) => {
      const aBoardNum = parseInt(a.pilotRecord?.boardNumber || a.boardNumber || '', 10);
      const bBoardNum = parseInt(b.pilotRecord?.boardNumber || b.boardNumber || '', 10);
      if (isNaN(aBoardNum) && isNaN(bBoardNum)) return 0;
      if (isNaN(aBoardNum)) return 1;
      if (isNaN(bBoardNum)) return -1;
      return aBoardNum - bBoardNum;
    });
  };

  // Helper function to create block quote format
  const createBlockQuote = (entries) => {
    if (entries.length === 0) return '-';
    const sorted = sortByBoardNumber(entries);
    const formattedEntries = sorted.map(formatPilotEntry);
    const content = formattedEntries.map(entry => `> ${entry}`).join('\n');
    return content.length > 1020 ? formattedEntries.slice(0, 20).map(entry => `> ${entry}`).join('\n') + `\n> ... and ${formattedEntries.length - 20} more` : content;
  };
  
  // MODIFIED: groupByQualifications - now returns structured data for accepted only
  // Now uses instructor enrollments instead of IP qualification
  const groupByQualifications = (entries, isTraining = false, trainingEnrollees = [], instructorEnrollees = []) => {
    if (entries.length === 0) return { flightLead: [], sectionLead: [], wingman: [] };

    if (isTraining) {
      // For training events, group by: Trainee, IP (enrolled instructors), Other Participants
      const traineeIds = new Set(trainingEnrollees.map(e => e.pilot_id));
      const instructorIds = new Set(instructorEnrollees.map(e => e.pilot_id));

      const trainees = entries.filter(entry => {
        const pilotId = entry.pilotRecord?.id;
        return pilotId && traineeIds.has(pilotId);
      });

      // IPs are now pilots enrolled as instructors for this cycle (not based on qualification)
      const ips = entries.filter(entry => {
        const pilotId = entry.pilotRecord?.id;
        // Must be an enrolled instructor AND not a trainee
        return pilotId && instructorIds.has(pilotId) && !traineeIds.has(pilotId);
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
    const pilotLines = sortByBoardNumber(pilots).map(formatPilotEntry).join('\n');
    return `>>> ${pilotLines}`;
  };

  // Mission Support roles configured on the event (event_settings.supportRoleRequirements).
  // Array order is display order; each entry: { qualificationId, name, required }
  const supportRoleRequirements = Array.isArray(eventOptions.supportRoleRequirements)
    ? eventOptions.supportRoleRequirements.filter(r => r && r.name)
    : [];

  const supportRoleDisplayNames = {
    'Landing Signals Officer': 'LSO'
  };

  // Mission Support Section Generator - ONLY accepted pilots with >>> block quote.
  // When the event has configured role requirements: every configured role is shown
  // (even 0/x), in configured order, as "Role (available/required)"; unconfigured
  // roles are hidden. Otherwise falls back to the legacy hardcoded roles, occupied only.
  const generateMissionSupportSection = (entries) => {
    if (supportRoleRequirements.length > 0) {
      let totalAvailable = 0;
      let totalRequired = 0;

      const fields = supportRoleRequirements.map(req => {
        const required = Math.max(0, parseInt(req.required, 10) || 0);
        const qualPilots = entries.filter(entry => {
          const rec = entry.pilotRecord;
          if (!rec) return false;
          // Match on the stable qualification ID so renaming a qualification
          // doesn't break saved events; fall back to name for pilot records
          // built before qualificationIds existed
          if (req.qualificationId && Array.isArray(rec.qualificationIds)) {
            return rec.qualificationIds.includes(req.qualificationId);
          }
          return (rec.qualifications || []).includes(req.name);
        });
        totalAvailable += qualPilots.length;
        totalRequired += required;

        const displayName = supportRoleDisplayNames[req.name] || req.name;
        const value = qualPilots.length > 0
          ? `>>> ${sortByBoardNumber(qualPilots).map(formatPilotEntry).join('\n')}`
          : '>>> -';

        return { name: `*${displayName} (${qualPilots.length}/${required})*`, value };
      });

      return {
        fields,
        header: `**Mission Support (${totalAvailable}/${totalRequired})**`,
        hasSupportPilots: true
      };
    }

    // Legacy behavior for events without configured requirements
    const auxiliaryQualifications = ['Mission Commander', 'JTAC', 'Landing Signals Officer'];
    const supportMap = new Map();

    auxiliaryQualifications.forEach(qual => supportMap.set(qual, []));

    entries.forEach(entry => {
      const qualifications = entry.pilotRecord?.qualifications || [];

      auxiliaryQualifications.forEach(qual => {
        if (qualifications.includes(qual)) {
          supportMap.get(qual).push(entry);
        }
      });
    });

    const hasSupportPilots = Array.from(supportMap.values()).some(arr => arr.length > 0);

    if (!hasSupportPilots) {
      return null;
    }

    const fields = [];
    auxiliaryQualifications.forEach(qual => {
      const qualPilots = supportMap.get(qual) || [];
      if (qualPilots.length > 0) {
        const displayName = supportRoleDisplayNames[qual] || qual;
        const pilotLines = sortByBoardNumber(qualPilots).map(formatPilotEntry).join('\n');
        fields.push({ name: `*${displayName} (${qualPilots.length})*`, value: `>>> ${pilotLines}` });
      }
    });

    return { fields, header: '**Mission Support**', hasSupportPilots: true };
  };

  // Build the Mission Support embed fields (rows of 3 inline fields, header on the
  // first field, second/third fields of the first row padded for alignment).
  // Renders when the event has configured role requirements, or - legacy - when
  // qualification tracking is on and a hardcoded support role is occupied.
  const buildMissionSupportEmbedFields = (entries) => {
    const shouldTrack = eventOptions.trackQualifications || false;
    if (supportRoleRequirements.length === 0 && !shouldTrack) return [];

    const result = generateMissionSupportSection(entries);
    if (!result || !result.hasSupportPilots) return [];

    const embedFields = result.fields.map((field, index) => {
      let name = field.name;
      if (index === 0) {
        name = `<:awacs:1229253561528090664> ${result.header}\n${field.name}`;
      } else if (index < 3) {
        name = `\u200B\n${field.name}`;
      }
      return { name, value: field.value, inline: true };
    });

    // Pad to a full row of 3 so following sections align correctly
    while (embedFields.length % 3 !== 0) {
      embedFields.push({
        name: embedFields.length < 3 ? '\u200B\n\u200B' : '\u200B',
        value: '\u200B',
        inline: true
      });
    }

    return embedFields;
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
  const instructorEnrollees = eventOptions.trainingData?.instructorEnrollees || [];

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

  // Event Activities grouping (opt-in per event via event_settings.groupByActivity;
  // eventOptions.activityData is null for every event that hasn't enabled it)
  const activityData = eventOptions.activityData || null;

  if (hasNoResponses && !shouldShowNoResponse) {
    // Add placeholder text when no responses have been recorded yet AND showNoResponse is disabled or has no users
    embed.addFields(
      { name: '\u200B', value: '*No Responses Recorded Yet*', inline: false }
    );
  } else if (activityData && activityData.activities.length > 0) {
    // ACTIVITY GROUPING: accepted pilots grouped by what they're doing.
    // Explicit override wins; then enrolled instructors (or IP qualification as
    // fallback) group as IP; cycle enrollees go to the first lesson activity;
    // everyone else lands in Other Participants.
    console.log(`[EMBED-STRUCTURE] Building with activity grouping (${activityData.activities.length} activities)`);

    const traineeIds = new Set(trainingEnrollees.map(e => e.pilot_id));
    const instructorIds = new Set(instructorEnrollees.map(e => e.pilot_id));
    const byActivity = new Map(activityData.activities.map(a => [a.id, []]));
    const firstLesson = activityData.activities.find(a => a.kind === 'lesson');
    const ips = [];
    const others = [];

    accepted.forEach(entry => {
      const pilotId = entry.pilotRecord?.id;

      const overrideId = pilotId ? activityData.overridesByPilot[pilotId] : undefined;
      if (overrideId && byActivity.has(overrideId)) {
        byActivity.get(overrideId).push(entry);
        return;
      }

      const isIP = instructorIds.size > 0
        ? (pilotId && instructorIds.has(pilotId) && !traineeIds.has(pilotId))
        : (entry.pilotRecord?.qualifications || []).includes('Instructor Pilot');
      if (isIP) {
        ips.push(entry);
        return;
      }

      if (pilotId && traineeIds.has(pilotId) && firstLesson) {
        byActivity.get(firstLesson.id).push(entry);
        return;
      }

      others.push(entry);
    });

    const activityFields = [];
    if (ips.length > 0) {
      activityFields.push({ name: `<:Hornet:541484781515440128> *IP (${ips.length})*`, value: formatQualGroup(ips), inline: true });
    }
    activityData.activities.forEach(activity => {
      const pilots = byActivity.get(activity.id) || [];
      activityFields.push({ name: `*${activity.displayName} (${pilots.length})*`, value: formatQualGroup(pilots), inline: true });
    });
    if (others.length > 0) {
      activityFields.push({ name: `*Other Participants (${others.length})*`, value: formatQualGroup(others), inline: true });
    }
    // Pad to full rows of 3 so following sections align correctly
    while (activityFields.length % 3 !== 0) {
      activityFields.push({ name: '\u200B', value: '\u200B', inline: true });
    }
    embed.addFields(...activityFields);

    // Mission Support section (ONLY accepted pilots)
    {
      const missionSupportFields = buildMissionSupportEmbedFields(accepted);
      if (missionSupportFields.length > 0) {
        embed.addFields(...missionSupportFields);
      }
    }

    // Tentative / Declined / No Response tail (same as the other layouts)
    if (shouldShowNoResponse) {
      if (allowTentative) {
        const tentativeText = tentative.length > 0 ? createBlockQuote(tentative) : '-';
        const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
        const noResponseText = createBlockQuote(noResponse);

        embed.addFields(
          { name: `\u2753 **Tentative** (${tentative.length})`, value: tentativeText, inline: true },
          { name: `\u274C **Declined** (${declined.length})`, value: declinedText, inline: true },
          { name: `\u23F3 **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
        );
      } else {
        const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
        const noResponseText = createBlockQuote(noResponse);

        embed.addFields(
          { name: `\u274C **Declined** (${declined.length})`, value: declinedText, inline: true },
          { name: `\u23F3 **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
        );
      }
    } else {
      if (allowTentative && tentative.length > 0) {
        embed.addFields(
          { name: `\u2753 **Tentative** (${tentative.length})`, value: createBlockQuote(tentative), inline: false }
        );
      }

      if (declined.length > 0) {
        embed.addFields(
          { name: `\u274C **Declined** (${declined.length})`, value: createBlockQuote(declined), inline: false }
        );
      }
    }
  } else if (shouldGroupBySquadron) {
    console.log(`[EMBED-STRUCTURE] Building with squadron grouping`);

    if (isTrainingEvent) {
      // Training events: Trainee and IP are squadron-agnostic, only Other Participants are grouped by squadron
      console.log(`[EMBED-STRUCTURE] Training event with squadron grouping - Trainees/IPs squadron-agnostic`);

      const grouped = groupByQualifications(accepted, isTrainingEvent, trainingEnrollees, instructorEnrollees);

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
      {
        const missionSupportFields = buildMissionSupportEmbedFields(accepted);
        if (missionSupportFields.length > 0) {
          embed.addFields(...missionSupportFields);
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
          const grouped = groupByQualifications(group.accepted, isTrainingEvent, trainingEnrollees, instructorEnrollees);

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
      {
        const missionSupportFields = buildMissionSupportEmbedFields(accepted);
        if (missionSupportFields.length > 0) {
          embed.addFields(...missionSupportFields);
        }
      }
    }

    // Add Tentative, Declined, and No Response sections at the end (in 3-column layout if showNoResponse)
    if (shouldShowNoResponse) {
      // Use 3-column layout: Tentative | Declined | No Response (or 2-column if tentative disabled)
      if (allowTentative) {
        const tentativeText = tentative.length > 0 ? createBlockQuote(tentative) : '-';
        const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
        const noResponseText = createBlockQuote(noResponse);

        embed.addFields(
          { name: `❓ **Tentative** (${tentative.length})`, value: tentativeText, inline: true },
          { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: true },
          { name: `⏳ **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
        );
      } else {
        // 2-column layout: Declined | No Response
        const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
        const noResponseText = createBlockQuote(noResponse);

        embed.addFields(
          { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: true },
          { name: `⏳ **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
        );
      }
    } else {
      // Use original layout without No Response
      if (allowTentative && tentative.length > 0) {
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
        const grouped = groupByQualifications(accepted, isTrainingEvent, trainingEnrollees, instructorEnrollees);

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
        const grouped = groupByQualifications(accepted, isTrainingEvent, trainingEnrollees, instructorEnrollees);

        const flText = formatQualGroup(grouped.flightLead);
        const slText = formatQualGroup(grouped.sectionLead);
        const wmText = formatQualGroup(grouped.wingman);

        embed.addFields(
          { name: '*Flight Lead (' + grouped.flightLead.length + ')*', value: flText, inline: true },
          { name: '*Section Lead (' + grouped.sectionLead.length + ')*', value: slText, inline: true },
          { name: '*Wingman (' + grouped.wingman.length + ')*', value: wmText, inline: true }
        );
      }

    } else {
      // Show all accepted pilots without grouping
      const acceptedText = accepted.length > 0 ? createBlockQuote(accepted) : '-';
      embed.addFields(
        { name: 'All Pilots', value: acceptedText, inline: false }
      );
    }

    // Add Mission Support section (ONLY accepted pilots)
    {
      const missionSupportFields = buildMissionSupportEmbedFields(accepted);
      if (missionSupportFields.length > 0) {
        embed.addFields(...missionSupportFields);
      }
    }

    // Add Tentative, Declined, and No Response sections at the end (in 3-column layout if showNoResponse)

    if (shouldShowNoResponse) {
      // Use 3-column layout: Tentative | Declined | No Response (or 2-column if tentative disabled)
      if (allowTentative) {
        const tentativeText = tentative.length > 0 ? createBlockQuote(tentative) : '-';
        const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
        const noResponseText = createBlockQuote(noResponse);

        embed.addFields(
          { name: `❓ **Tentative** (${tentative.length})`, value: tentativeText, inline: true },
          { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: true },
          { name: `⏳ **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
        );
      } else {
        // 2-column layout: Declined | No Response
        const declinedText = declined.length > 0 ? createBlockQuote(declined) : '-';
        const noResponseText = createBlockQuote(noResponse);

        embed.addFields(
          { name: `❌ **Declined** (${declined.length})`, value: declinedText, inline: true },
          { name: `⏳ **No Response** (${noResponse.length})`, value: noResponseText, inline: true }
        );
      }
    } else {
      // Use original layout without No Response
      if (allowTentative && tentative.length > 0) {
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
// Note: Description is omitted to avoid exceeding Discord's 1024 char limit for embed field values
function createGoogleCalendarLink(title, description, startTime, endTime) {
  const encodedTitle = encodeURIComponent(title);

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

  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${startTimeFormatted}/${endTimeFormatted}`;
}

module.exports = {
  createEventEmbed,
  createAdditionalImageEmbeds,
  createGoogleCalendarLink
};