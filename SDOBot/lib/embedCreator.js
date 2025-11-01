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
function createEventEmbed(title, description, eventTime, responses = {}, creator = null, images = null, eventOptions = {}) {
  // VERSION SENTINEL
  console.log(`[CODE-VERSION-SENTINEL] createEventEmbed v3.1 - Added No Response Support`);
  console.log(`[CODE-VERSION-SENTINEL] Event: ${title}, trackQuals: ${eventOptions.trackQualifications}, groupSquad: ${eventOptions.groupBySquadron}, showNoResponse: ${eventOptions.showNoResponse}`);

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
  const groupByQualifications = (entries, isTraining = false) => {
    if (entries.length === 0) return { flightLead: [], sectionLead: [], wingman: [] };
    
    if (isTraining) {
      const ips = entries.filter(entry => {
        const qualifications = entry.pilotRecord?.qualifications || [];
        return qualifications.includes('Instructor Pilot');
      });
      
      const ipIds = new Set(ips.map(ip => ip.userId || ip.discordId));
      const trainees = entries.filter(entry => !ipIds.has(entry.userId || entry.discordId));
      
      return { ips, trainees };
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
  const isTrainingEvent = eventOptions.eventType === 'Hop' || title.toLowerCase().includes('training');

  console.log(`[EVENT-TYPE-DEBUG] Event "${title}": eventType=${eventOptions.eventType}, isTrainingEvent=${isTrainingEvent}, shouldTrackQualifications=${shouldTrackQualifications}, shouldGroupBySquadron=${shouldGroupBySquadron}`);
  
  // Create embed
  const embed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(title);
  
  if (description && description.trim().length > 0) {
    embed.setDescription(description);
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
    
    const squadronGroups = organizeBySquadron(accepted, tentative, declined);

    // REMOVED: Attending header

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
        // Show Flight Lead | Section Lead | Wingman columns with Hornet emojis in field names
        const grouped = groupByQualifications(group.accepted, isTrainingEvent);

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

    // Add spacer before Tentative section (only if there are accepted users or mission support)
    if (accepted.length > 0) {
      embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
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
      // Show Flight Lead | Section Lead | Wingman columns
      const grouped = groupByQualifications(accepted, isTrainingEvent);
      
      const flText = formatQualGroup(grouped.flightLead);
      const slText = formatQualGroup(grouped.sectionLead);
      const wmText = formatQualGroup(grouped.wingman);

      embed.addFields(
        { name: '*Flight Lead (' + grouped.flightLead.length + ')*', value: flText, inline: true },
        { name: '*Section Lead (' + grouped.sectionLead.length + ')*', value: slText, inline: true },
        { name: '*Wingman (' + grouped.wingman.length + ')*', value: wmText, inline: true }
      );

      // Add Mission Support section (ONLY accepted pilots)
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
    } else {
      // Show all accepted pilots without grouping
      const acceptedText = accepted.length > 0 ? createBlockQuote(accepted) : '-';
      embed.addFields(
        { name: 'All Pilots', value: acceptedText, inline: false }
      );
    }

    // Add spacer before Tentative section (only if there are accepted users or mission support)
    if (accepted.length > 0) {
      embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
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