/**
 * THREAD MANAGER MODULE
 * Handles Discord thread creation, posting, and deletion
 */

const { ensureLoggedIn, getClient } = require('./discordClient');

/**
 * Create a thread from a Discord message
 */
async function createThreadFromMessage(messageId, threadName, guildId, channelId, autoArchiveDuration = 1440) {
  try {
    console.log(`[THREAD-CREATE] Creating thread "${threadName}" from message ${messageId} in guild ${guildId}, channel ${channelId}`);
    
    await ensureLoggedIn();
    
    const client = getClient();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found or bot doesn't have access`);
    }
    
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found in guild ${guildId}`);
    }
    
    const message = await channel.messages.fetch(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found in channel ${channelId}`);
    }
    
    const thread = await message.startThread({
      name: threadName,
      autoArchiveDuration: autoArchiveDuration,
      reason: 'ReadyRoom event discussion thread'
    });

    console.log(`[THREAD-CREATE-SUCCESS] Thread "${threadName}" created with ID ${thread.id}`);
    console.log(`[THREAD-CREATE-DEBUG] Thread object properties:`, {
      id: thread.id,
      type: thread.type,
      parentId: thread.parentId,
      ownerId: thread.ownerId,
      name: thread.name,
      guildId: thread.guildId
    });
    console.log(`[THREAD-CREATE-DEBUG] Original message ID: ${messageId}`);

    // Ensure the bot is a member of the thread (required to post messages)
    // The bot should be automatically added, but explicitly joining ensures access
    try {
      await thread.join();
      console.log(`[THREAD-CREATE] Bot joined thread ${thread.id}`);
    } catch (joinError) {
      console.warn(`[THREAD-CREATE] Could not join thread (might already be a member):`, joinError.message);
    }

    // Check bot's permissions in the thread
    try {
      const botMember = await guild.members.fetch(client.user.id);
      const permissions = thread.permissionsFor(botMember);
      console.log(`[THREAD-CREATE-DEBUG] Bot permissions in thread:`, {
        canSendMessages: permissions?.has('SendMessages'),
        canSendMessagesInThreads: permissions?.has('SendMessagesInThreads'),
        canViewChannel: permissions?.has('ViewChannel'),
        canReadMessageHistory: permissions?.has('ReadMessageHistory'),
        allPermissions: permissions?.toArray()
      });
    } catch (permError) {
      console.warn(`[THREAD-CREATE] Could not check permissions:`, permError.message);
    }

    return {
      success: true,
      threadId: thread.id,
      threadName: thread.name,
      guildId: guildId,
      channelId: channelId,
      messageId: messageId
    };
  } catch (error) {
    console.error(`[THREAD-CREATE-ERROR] Failed to create thread from message ${messageId}:`, error);
    
    if (error.code === 50013) {
      return { success: false, error: 'Bot lacks permissions to create threads in this channel' };
    } else if (error.code === 50035) {
      return { success: false, error: 'Thread name is invalid or too long' };
    } else if (error.code === 160004) {
      return { success: false, error: 'Channel does not support threads' };
    }
    
    return { success: false, error: error.message || 'Unknown error creating thread' };
  }
}

/**
 * Post a message to a Discord thread
 */
async function postMessageToThread(threadId, guildId, message) {
  try {
    console.log(`[THREAD-POST] Posting message to thread ${threadId} in guild ${guildId}`);
    
    await ensureLoggedIn();
    
    const client = getClient();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found or bot doesn't have access`);
    }
    
    let thread = guild.channels.cache.get(threadId);
    console.log(`[THREAD-POST-DEBUG] Thread from cache: ${thread ? 'found' : 'not found'}`);

    if (!thread) {
      console.log(`[THREAD-POST-DEBUG] Fetching thread ${threadId} from Discord API`);
      try {
        const fetchedThread = await guild.channels.fetch(threadId);
        console.log(`[THREAD-POST-DEBUG] Fetched thread properties:`, {
          id: fetchedThread?.id,
          type: fetchedThread?.type,
          parentId: fetchedThread?.parentId,
          isThread: fetchedThread?.isThread(),
          archived: fetchedThread?.archived,
          locked: fetchedThread?.locked
        });

        if (!fetchedThread || !fetchedThread.isThread()) {
          throw new Error(`Thread ${threadId} not found or is not a thread`);
        }

        thread = fetchedThread;
      } catch (fetchError) {
        console.error(`[THREAD-POST-DEBUG] Fetch error:`, fetchError);
        throw new Error(`Thread ${threadId} not found in guild ${guildId}: ${fetchError.message}`);
      }
    }

    if (!thread.isThread()) {
      console.error(`[THREAD-POST-DEBUG] Channel ${threadId} is not a thread, type: ${thread.type}`);
      throw new Error(`Channel ${threadId} is not a thread`);
    }

    // Check bot's permissions in the thread before attempting to send
    try {
      const botMember = await guild.members.fetch(client.user.id);
      const permissions = thread.permissionsFor(botMember);
      console.log(`[THREAD-POST-DEBUG] Bot permissions in thread ${threadId}:`, {
        canSendMessages: permissions?.has('SendMessages'),
        canSendMessagesInThreads: permissions?.has('SendMessagesInThreads'),
        canViewChannel: permissions?.has('ViewChannel'),
        canReadMessageHistory: permissions?.has('ReadMessageHistory'),
        allPermissions: permissions?.toArray()
      });
    } catch (permError) {
      console.warn(`[THREAD-POST] Could not check permissions:`, permError.message);
    }

    console.log(`[THREAD-POST-DEBUG] About to send message to thread ${threadId}`);
    const sentMessage = await thread.send(message);
    console.log(`[THREAD-POST-SUCCESS] Message posted to thread ${threadId}: ${sentMessage.id}`);

    return {
      success: true,
      messageId: sentMessage.id,
      threadId: threadId
    };
  } catch (error) {
    console.error(`[THREAD-POST-ERROR] Failed to post message to thread ${threadId}:`, error);
    
    if (error.code === 50013) {
      return { success: false, error: 'Bot lacks permissions to send messages in this thread' };
    } else if (error.code === 10003) {
      return { success: false, error: 'Thread not found or has been deleted' };
    } else if (error.code === 50083) {
      return { success: false, error: 'Thread is archived and cannot receive new messages' };
    }
    
    return { success: false, error: error.message || 'Unknown error posting to thread' };
  }
}

/**
 * Delete a thread and all its messages
 */
async function deleteThread(threadId, guildId) {
  try {
    console.log(`[THREAD-DELETE] Attempting to delete thread ${threadId} in guild ${guildId}`);
    
    await ensureLoggedIn();
    
    const client = getClient();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found or bot doesn't have access`);
    }
    
    let thread = guild.channels.cache.get(threadId);
    if (!thread) {
      try {
        thread = await guild.channels.fetch(threadId);
      } catch (fetchError) {
        console.warn(`[THREAD-DELETE] Thread ${threadId} not found or already deleted`);
        return { success: true, alreadyDeleted: true };
      }
    }
    
    if (!thread || !thread.isThread()) {
      console.warn(`[THREAD-DELETE] ${threadId} is not a thread or doesn't exist`);
      return { success: false, error: 'Not a thread or thread not found' };
    }
    
    await thread.delete('ReadyRoom event deleted');
    
    console.log(`[THREAD-DELETE] Successfully deleted thread ${threadId} and all its messages`);
    return { success: true };
    
  } catch (error) {
    console.error(`[THREAD-DELETE] Error deleting thread ${threadId}:`, error);
    
    if (error.code === 50013) {
      return { success: false, error: 'Bot lacks permissions to delete threads' };
    } else if (error.code === 10003) {
      return { success: false, error: 'Thread not found' };
    }
    
    return { success: false, error: error.message || 'Unknown error deleting thread' };
  }
}

/**
 * Check if threading should be used for an event
 */
async function shouldUseThreadsForEvent(participatingSquadrons, guildId, channelId, supabase) {
  try {
    console.log(`[THREAD-DECISION] Checking thread usage for ${participatingSquadrons.length} squadrons in guild ${guildId}, channel ${channelId}`);
    
    if (!participatingSquadrons || participatingSquadrons.length === 0) {
      console.log(`[THREAD-DECISION] No participating squadrons, defaulting to no threads`);
      return { shouldUseThreads: false, autoArchiveDuration: 1440 };
    }
    
    const squadronIds = participatingSquadrons.map(squadron => 
      typeof squadron === 'string' ? squadron : squadron.id || squadron.squadronId
    ).filter(id => id);
    
    if (squadronIds.length === 0) {
      console.log(`[THREAD-DECISION] No valid squadron IDs found, defaulting to no threads`);
      return { shouldUseThreads: false, autoArchiveDuration: 1440 };
    }
    
    console.log(`[THREAD-DECISION] Checking threading settings for squadron IDs:`, squadronIds);
    
    const { data: squadronData, error: settingsError } = await supabase
      .from('org_squadrons')
      .select('id, settings')
      .in('id', squadronIds);
    
    if (settingsError) {
      console.warn(`[THREAD-DECISION] Error querying squadron settings:`, settingsError);
      return { shouldUseThreads: false, autoArchiveDuration: 1440 };
    }
    
    console.log(`[THREAD-DECISION] Found ${squadronData?.length || 0} squadron records in database`);
    
    let useThreads = false;
    let autoArchiveDuration = 1440;
    
    squadronData.forEach(squadron => {
      const settings = squadron.settings || {};
      const threadingSettings = settings.threadingSettings || {};
      console.log(`[THREAD-DECISION] Squadron ${squadron.id} threading settings:`, threadingSettings);
      
      if (threadingSettings.useThreads === true) {
        useThreads = true;
      }
      
      if (threadingSettings.autoArchiveDuration && autoArchiveDuration === 1440) {
        const duration = parseInt(threadingSettings.autoArchiveDuration);
        if (!isNaN(duration) && [60, 1440, 4320, 10080].includes(duration)) {
          autoArchiveDuration = duration;
        }
      }
    });
    
    console.log(`[THREAD-DECISION] Threading decision: useThreads=${useThreads}, autoArchiveDuration=${autoArchiveDuration}`);
    
    return {
      shouldUseThreads: useThreads,
      autoArchiveDuration: autoArchiveDuration
    };
  } catch (error) {
    console.error(`[THREAD-DECISION-ERROR] Error determining thread usage:`, error);
    return { shouldUseThreads: false, autoArchiveDuration: 1440 };
  }
}

/**
 * Get thread ID for a specific event and channel
 */
async function getThreadIdForEvent(eventId, guildId, channelId, supabase) {
  try {
    console.log(`[THREAD-LOOKUP] Looking up thread ID for event ${eventId}, guild ${guildId}, channel ${channelId}`);
    
    const { data: threadResult, error: threadError } = await supabase
      .rpc('get_thread_id_for_channel', {
        p_event_id: eventId,
        p_guild_id: guildId,
        p_channel_id: channelId
      });
    
    if (threadError) {
      console.warn(`[THREAD-LOOKUP] Error querying thread ID:`, threadError);
      return null;
    }
    
    const threadId = threadResult || null;
    console.log(`[THREAD-LOOKUP] Thread ID for event ${eventId}: ${threadId || 'not found'}`);
    
    return threadId;
  } catch (error) {
    console.error(`[THREAD-LOOKUP-ERROR] Error looking up thread ID:`, error);
    return null;
  }
}

module.exports = {
  createThreadFromMessage,
  postMessageToThread,
  deleteThread,
  shouldUseThreadsForEvent,
  getThreadIdForEvent
};
