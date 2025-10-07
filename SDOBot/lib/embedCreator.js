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
  console.log(`[CODE-VERSION-SENTINEL] createEventEmbed v2.0 - Mission Support Separation`);
  console.log(`[CODE-VERSION-SENTINEL] Event: ${title}, trackQuals: ${eventOptions.trackQualifications}, groupSquad: ${eventOptions.groupBySquadron}`);
  
  const accepted = responses.accepted || [];
  const declined = responses.declined || [];
  const tentative = responses.tentative || [];
  
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
  
  // Helper function for training events
  const groupByQualifications = (entries, isTraining = false) => {
    if (entries.length === 0) return '-';
    
    if (isTraining) {
      const ips = entries.filter(entry => {
        const qualifications = entry.pilotRecord?.qualifications || [];
        console.log(`[TRAINING-DEBUG] ${entry.displayName}: qualifications=${JSON.stringify(qualifications)}, hasIP=${qualifications.includes('Instructor Pilot')}, pilotRecord=${!!entry.pilotRecord}`);
        return qualifications.includes('Instructor Pilot');
      });
      
      const ipIds = new Set(ips.map(ip => ip.userId || ip.discordId));
      const trainees = entries.filter(entry => !ipIds.has(entry.userId || entry.discordId));
      
      let result = '';
      if (ips.length > 0) {
        const ipPilots = ips.map(formatPilotEntry);
        const ipContent = ipPilots.map(entry => `> ${entry}`).join('\n');
        result += `*IP (${ips.length})*\n${ipContent}`;
      }
      if (trainees.length > 0) {
        if (result) result += '\n\n';
        const traineePilots = trainees.map(formatPilotEntry);
        const traineeContent = traineePilots.map(entry => `> ${entry}`).join('\n');
        result += `*Trainee (${trainees.length})*\n${traineeContent}`;
      }
      
      if (result === '') {
        const allPilots = entries.map(formatPilotEntry);
        const allContent = allPilots.map(entry => `> ${entry}`).join('\n');
        result = `*IP (${entries.length})*\n${allContent}`;
      }
      
      return (result.length > 1020) ? result.substring(0, 1020) + '...' : (result || '-');
    }
    
    // Standard grouping - PRIMARY qualifications only (NO auxiliary)
    const primaryQualifications = ['Flight Lead', 'Section Lead'];
    const primaryGroups = {};
    const wingmen = [];

    entries.forEach(entry => {
      let assignedToPrimary = false;
      const qualifications = entry.pilotRecord?.qualifications || [];

      for (const qual of primaryQualifications) {
        if (qualifications.includes(qual)) {
          if (!primaryGroups[qual]) primaryGroups[qual] = [];
          primaryGroups[qual].push(entry);
          assignedToPrimary = true;
          break;
        }
      }

      if (!assignedToPrimary) {
        wingmen.push(entry);
      }
      // REMOVED: auxiliary qualification collection
    });

    let result = '';

    primaryQualifications.forEach(qual => {
      if (primaryGroups[qual] && primaryGroups[qual].length > 0) {
        if (result) result += '\n';
        const pilots = primaryGroups[qual].map(formatPilotEntry);
        const pilotLines = pilots.map(entry => `> ${entry}`).join('\n');
        result += `*${qual} (${primaryGroups[qual].length})*\n${pilotLines}`;
      }
    });

    if (wingmen.length > 0) {
      if (result) result += '\n';
      const pilots = wingmen.map(formatPilotEntry);
      const wingmenLines = pilots.map(entry => `> ${entry}`).join('\n');
      result += `*Wingman (${wingmen.length})*\n${wingmenLines}`;
    }
    // REMOVED: auxiliary qualification display

    return (result.length > 1020) ? result.substring(0, 1020) + '...' : (result || '-');
  };

  // MODIFIED: Helper for squadron grouping - PRIMARY qualifications only
  const groupPilotsByQualification = (pilots) => {
    const primaryQualifications = ['Flight Lead', 'Section Lead'];
    const wingmen = [];
    const primaryGroups = {};

    pilots.forEach(entry => {
      let assignedToPrimary = false;
      const qualifications = entry.pilotRecord?.qualifications || [];

      for (const qual of primaryQualifications) {
        if (qualifications.includes(qual)) {
          if (!primaryGroups[qual]) primaryGroups[qual] = [];
          primaryGroups[qual].push(entry);
          assignedToPrimary = true;
          break;
        }
      }

      if (!assignedToPrimary) wingmen.push(entry);
      // REMOVED: auxiliary qualification collection
    });

    let result = '';

    primaryQualifications.forEach(qual => {
      if (primaryGroups[qual] && primaryGroups[qual].length > 0) {
        if (result) result += '\n';
        const pilotLines = primaryGroups[qual].map(formatPilotEntry).map(entry => `> ${entry}`).join('\n');
        result += `*${qual} (${primaryGroups[qual].length})*\n${pilotLines}`;
      }
    });

    if (wingmen.length > 0) {
      if (result) result += '\n';
      const pilotLines = wingmen.map(formatPilotEntry).map(entry => `> ${entry}`).join('\n');
      result += `*Wingman (${wingmen.length})*\n${pilotLines}`;
    }
    // REMOVED: auxiliary qualification display

    return result || '-';
  };

  // NEW: Mission Support Section Generator
  const generateMissionSupportSection = (entries) => {
    console.log(`[MISSION-SUPPORT-SENTINEL] generateMissionSupportSection called with ${entries.length} entries`);
    
    // Use exact qualification names from database
    const auxiliaryQualifications = ['Mission Commander', 'JTAC', 'Landing Signals Officer'];
    const supportMap = new Map();

    auxiliaryQualifications.forEach(qual => supportMap.set(qual, []));

    entries.forEach(entry => {
      const qualifications = entry.pilotRecord?.qualifications || [];
      console.log(`[MISSION-SUPPORT-SENTINEL] Checking ${entry.displayName}: qualifications=${JSON.stringify(qualifications)}`);
      
      auxiliaryQualifications.forEach(qual => {
        if (qualifications.includes(qual)) {
          console.log(`[MISSION-SUPPORT-SENTINEL] Adding ${entry.displayName} to ${qual}`);
          supportMap.get(qual).push(entry);
        }
      });
    });

    const hasSupportPilots = Array.from(supportMap.values()).some(arr => arr.length > 0);
    
    console.log(`[MISSION-SUPPORT-SENTINEL] hasSupportPilots=${hasSupportPilots}`);
    
    if (!hasSupportPilots) {
      console.log(`[MISSION-SUPPORT-SENTINEL] No support pilots found, returning empty string`);
      return '';
    }

    // NEW: Build as 3-column layout with roles wrapping across columns
    const columns = [[], [], []]; // Left, Center, Right
    let currentColumn = 0;

    // Display names for roles (shortened for display)
    const displayNames = {
      'Mission Commander': 'Mission Commander',
      'JTAC': 'JTAC',
      'Landing Signals Officer': 'LSO'
    };

    auxiliaryQualifications.forEach(qual => {
      const qualPilots = supportMap.get(qual) || [];
      if (qualPilots.length > 0) {
        const displayName = displayNames[qual] || qual;
        console.log(`[MISSION-SUPPORT-SENTINEL] Adding ${qualPilots.length} pilots to ${qual} in column ${currentColumn}`);
        const pilotLines = qualPilots.map(formatPilotEntry).map(entry => `> ${entry}`).join('\n');
        const qualSection = `*${displayName} (${qualPilots.length})*\n${pilotLines}`;
        columns[currentColumn].push(qualSection);
        
        // Move to next column, wrap around after 3
        currentColumn = (currentColumn + 1) % 3;
      }
    });

    console.log(`[MISSION-SUPPORT-SENTINEL] Built columns with content:`, columns.map((col, i) => `Column ${i}: ${col.length} sections`));
    
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
    .setTitle(title)
    .setURL('https://readyroom.app');
  
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
      { name: '\u200B', value: '\u200B', inline: true }
      // REMOVED: spacing row after countdown - this was creating double space
    );
  }

  // Build attendance fields based on grouping option
  if (shouldGroupBySquadron) {
    console.log(`[MISSION-SUPPORT-SENTINEL] Building embed with squadron grouping, shouldTrackQualifications=${shouldTrackQualifications}`);
    
    const squadronGroups = organizeBySquadron(accepted, tentative, declined);

    // Add column headers directly after event time (no extra spacing)
    embed.addFields(
      { name: `✅ Accepted (${accepted.length})`, value: '\u200B', inline: true },
      { name: `❓ Tentative (${tentative.length})`, value: '\u200B', inline: true },
      { name: `❌ Declined (${declined.length})`, value: '\u200B', inline: true }
    );

    // Add each squadron as a row
    squadronGroups.forEach(group => {
      const { squadron } = group;
      
      // Calculate attending count - accepted only
      const acceptedCount = group.accepted.length;
      
      // Format squadron header with emoji and designation only
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

      const acceptedText = groupPilotsByQualification(group.accepted);
      const tentativeText = groupPilotsByQualification(group.tentative);
      const declinedText = groupPilotsByQualification(group.declined);

      embed.addFields(
        { name: '\u200B', value: `${squadronHeader}\n${acceptedText}`, inline: true },
        { name: '\u200B', value: `\u200B\n${tentativeText}`, inline: true },
        { name: '\u200B', value: `\u200B\n${declinedText}`, inline: true }
      );
    });

    // Add mission support directly after squadrons
    if (shouldTrackQualifications) {
      console.log(`[MISSION-SUPPORT-SENTINEL] Qualification tracking enabled, generating mission support section`);
      const missionSupportResult = generateMissionSupportSection([...accepted, ...tentative]);
      
      if (missionSupportResult && missionSupportResult.hasSupportPilots) {
        console.log(`[MISSION-SUPPORT-SENTINEL] Adding mission support section to embed`);
        
        const { columns } = missionSupportResult;
        embed.addFields(
          { name: '<:awacs:1229253561528090664> **Available Mission Support**', value: columns[0].length > 0 ? columns[0].join('\n\n') : '-', inline: true },
          { name: '\u200B', value: columns[1].length > 0 ? columns[1].join('\n\n') : '-', inline: true },
          { name: '\u200B', value: columns[2].length > 0 ? columns[2].join('\n\n') : '-', inline: true }
        );
      }
    }
  } else {
    // Original layout without squadron grouping
    let acceptedText, tentativeText;

    if (shouldTrackQualifications || isTrainingEvent) {
      acceptedText = groupByQualifications(accepted, isTrainingEvent);
      tentativeText = groupByQualifications(tentative, isTrainingEvent);
    } else {
      acceptedText = createBlockQuote(accepted);
      tentativeText = createBlockQuote(tentative);
    }

    const declinedText = createBlockQuote(declined);

    embed.addFields(
      { name: `✅ Accepted (${accepted.length})`, value: acceptedText, inline: true },
      { name: `❓ Tentative (${tentative.length})`, value: tentativeText, inline: true },
      { name: `❌ Declined (${declined.length})`, value: declinedText, inline: true }
    );
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