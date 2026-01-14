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

    // Ensure the bot is a member of the thread
    try {
      await thread.join();
    } catch (joinError) {
      // Bot might already be a member, ignore
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
    console.error(`[THREAD] Failed to create thread from message ${messageId}:`, error.message);
    
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
    await ensureLoggedIn();

    const client = getClient();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found or bot doesn't have access`);
    }

    let thread = guild.channels.cache.get(threadId);

    if (!thread) {
      try {
        const fetchedThread = await guild.channels.fetch(threadId);
        if (!fetchedThread || !fetchedThread.isThread()) {
          throw new Error(`Thread ${threadId} not found or is not a thread`);
        }
        thread = fetchedThread;
      } catch (fetchError) {
        throw new Error(`Thread ${threadId} not found in guild ${guildId}: ${fetchError.message}`);
      }
    }

    if (!thread.isThread()) {
      throw new Error(`Channel ${threadId} is not a thread`);
    }

    const sentMessage = await thread.send(message);

    return {
      success: true,
      messageId: sentMessage.id,
      threadId: threadId
    };
  } catch (error) {
    console.error(`[THREAD] Failed to post to thread ${threadId}:`, error.message);
    
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
        return { success: true, alreadyDeleted: true };
      }
    }

    if (!thread || !thread.isThread()) {
      return { success: false, error: 'Not a thread or thread not found' };
    }

    await thread.delete('ReadyRoom event deleted');
    return { success: true };

  } catch (error) {
    console.error(`[THREAD] Error deleting thread ${threadId}:`, error.message);
    
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
    if (!participatingSquadrons || participatingSquadrons.length === 0) {
      return { shouldUseThreads: false, autoArchiveDuration: 1440 };
    }

    const squadronIds = participatingSquadrons.map(squadron =>
      typeof squadron === 'string' ? squadron : squadron.id || squadron.squadronId
    ).filter(id => id);

    if (squadronIds.length === 0) {
      return { shouldUseThreads: false, autoArchiveDuration: 1440 };
    }

    const { data: squadronData, error: settingsError } = await supabase
      .from('org_squadrons')
      .select('id, settings')
      .in('id', squadronIds);

    if (settingsError) {
      console.warn(`[THREAD] Error querying squadron settings:`, settingsError);
      return { shouldUseThreads: false, autoArchiveDuration: 1440 };
    }

    let useThreads = false;
    let autoArchiveDuration = 1440;

    (squadronData || []).forEach(squadron => {
      const settings = squadron.settings || {};
      const threadingSettings = settings.threadingSettings || {};

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

    return {
      shouldUseThreads: useThreads,
      autoArchiveDuration: autoArchiveDuration
    };
  } catch (error) {
    console.error(`[THREAD] Error determining thread usage:`, error.message);
    return { shouldUseThreads: false, autoArchiveDuration: 1440 };
  }
}

/**
 * Get thread ID for a specific event and channel
 */
async function getThreadIdForEvent(eventId, guildId, channelId, supabase) {
  try {
    const { data: threadResult, error: threadError } = await supabase
      .rpc('get_thread_id_for_channel', {
        p_event_id: eventId,
        p_guild_id: guildId,
        p_channel_id: channelId
      });

    if (threadError) {
      console.warn(`[THREAD] Error querying thread ID:`, threadError);
      return null;
    }

    return threadResult || null;
  } catch (error) {
    console.error(`[THREAD] Error looking up thread ID:`, error.message);
    return null;
  }
}

/**
 * Get the existing thread ID for a message
 */
async function getExistingThreadFromMessage(messageId, guildId, channelId) {
  try {
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

    // Check if message has a thread
    if (message.hasThread && message.thread) {
      return {
        success: true,
        threadId: message.thread.id,
        threadName: message.thread.name
      };
    }

    return { success: false, error: 'No thread exists for this message' };
  } catch (error) {
    console.error(`[THREAD] Failed to fetch thread for message ${messageId}:`, error.message);
    return { success: false, error: error.message || 'Unknown error fetching thread' };
  }
}

module.exports = {
  createThreadFromMessage,
  postMessageToThread,
  deleteThread,
  shouldUseThreadsForEvent,
  getThreadIdForEvent,
  getExistingThreadFromMessage
};
