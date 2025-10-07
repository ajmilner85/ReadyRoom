/**
 * MESSAGE MANAGER MODULE
 * Handles Discord message publishing, editing, and deletion
 */

const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { createEventEmbed, createAdditionalImageEmbeds } = require('./embedCreator');
const { ensureLoggedIn, findEventsChannel } = require('./discordClient');

/**
 * Create attendance buttons
 */
function createAttendanceButtons() {
  const acceptButton = new ButtonBuilder()
    .setCustomId('accept')
    .setLabel('Accept')
    .setStyle(ButtonStyle.Success);
  
  const declineButton = new ButtonBuilder()
    .setCustomId('decline')
    .setLabel('Decline')
    .setStyle(ButtonStyle.Danger);
  
  const tentativeButton = new ButtonBuilder()
    .setCustomId('tentative')
    .setLabel('Tentative')
    .setStyle(ButtonStyle.Primary);
  
  return new ActionRowBuilder().addComponents(acceptButton, tentativeButton, declineButton);
}

/**
 * Publish an event to Discord
 */
async function publishEventToDiscord(title, description, eventTime, guildId, channelId, imageUrl = null, creator = null, images = null, eventOptions = {}) {
  try {
    console.log(`[BOT-PUBLISH-START] Publishing event "${title}" to guild ${guildId}, channel ${channelId}`);
    
    await ensureLoggedIn();
    
    const eventsChannel = await findEventsChannel(guildId, channelId);
    console.log(`[BOT-PUBLISH] Found channel ${eventsChannel.name} (${eventsChannel.id}) in guild ${eventsChannel.guild.name} (${eventsChannel.guild.id})`);
    
    const imageData = images || (imageUrl ? { imageUrl } : null);
    const eventEmbed = createEventEmbed(title, description, eventTime, {}, creator, imageData, eventOptions);
    const buttons = createAttendanceButtons();
    
    const additionalEmbeds = createAdditionalImageEmbeds(imageData, 'https://readyroom.app');
    const allEmbeds = [eventEmbed, ...additionalEmbeds];
    
    if (imageData) {
      console.log(`[BOT-PUBLISH] Adding images to embed:`, {
        headerImage: imageData.headerImage || imageData.imageUrl || 'none',
        additionalImages: imageData.additionalImages?.length || 0
      });
      console.log(`[BOT-PUBLISH] Total embeds being sent: ${allEmbeds.length} (1 main + ${additionalEmbeds.length} additional)`);
    }
    
    console.log(`[BOT-PUBLISH] About to send message to channel ${eventsChannel.name} (${eventsChannel.id}) in guild ${eventsChannel.guild.name} (${eventsChannel.guild.id})`);
    
    const eventMessage = await eventsChannel.send({
      embeds: allEmbeds,
      components: [buttons]
    });
    
    console.log(`[BOT-PUBLISH-SUCCESS] Message ${eventMessage.id} successfully sent to ${eventsChannel.guild.name} (#${eventsChannel.name})`);
    
    const publishResult = {
      success: true,
      messageId: eventMessage.id,
      guildId: eventsChannel.guild.id,
      channelId: eventsChannel.id,
      threadId: null,
      threadCreated: false
    };
    
    console.log(`[BOT-PUBLISH] Final result being returned to server:`, JSON.stringify(publishResult));
    
    return publishResult;
  } catch (error) {
    console.error(`[BOT-PUBLISH] Error publishing event to Discord guild ${guildId}, channel ${channelId}:`, error);
    
    if (error.code === 50013) {
      throw new Error(`Bot lacks permissions to send messages in channel ${channelId}`);
    } else if (error.code === 10003) {
      throw new Error(`Channel ${channelId} not found in guild ${guildId}`);
    } else if (error.code === 50001) {
      throw new Error(`Bot lacks access to guild ${guildId}`);
    }
    
    throw error;
  }
}

/**
 * Edit a Discord event message
 */
async function editEventMessage(messageId, title, description, eventTime, guildId, channelId, existingResponses, imageUrl = null, creator = null, images = null, eventOptions = {}) {
  try {
    await ensureLoggedIn();
    
    const eventsChannel = await findEventsChannel(guildId, channelId);
    
    try {
      const message = await eventsChannel.messages.fetch(messageId);
      if (message) {
        const imageData = images || (imageUrl ? { imageUrl } : null);
        const eventEmbed = createEventEmbed(title, description, eventTime, existingResponses, creator, imageData, eventOptions);
        
        const additionalEmbeds = createAdditionalImageEmbeds(imageData, 'https://readyroom.app');
        const allEmbeds = [eventEmbed, ...additionalEmbeds];
        
        await message.edit({
          embeds: allEmbeds,
          components: message.components
        });
        
        console.log(`Successfully edited Discord message: ${messageId}`);
        return { success: true };
      }
    } catch (fetchError) {
      console.error(`Error fetching Discord message ${messageId} for edit:`, fetchError);
      if (fetchError.code === 10008) {
        console.log(`Message ${messageId} not found, cannot edit`);
        return { success: false, error: 'Message not found' };
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error editing Discord event message:', error);
    return { success: false, error: error.message || 'Unknown error editing message' };
  }
}

/**
 * Delete a Discord event message
 */
async function deleteEventMessage(messageId, guildId, channelId) {
  try {
    await ensureLoggedIn();
    
    const eventsChannel = await findEventsChannel(guildId, channelId);
    
    try {
      const message = await eventsChannel.messages.fetch(messageId);
      if (message) {
        await message.delete();
        console.log(`Successfully deleted Discord message: ${messageId}`);
        return { success: true };
      }
    } catch (fetchError) {
      console.error(`Error fetching Discord message ${messageId}:`, fetchError);
      if (fetchError.code === 10008) {
        console.log(`Message ${messageId} already deleted or not found`);
        return { success: true, alreadyDeleted: true };
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error deleting Discord event message:', error);
    return { success: false, error: error.message || 'Failed to delete message' };
  }
}

/**
 * Send reminder message to a Discord channel or thread
 */
async function sendReminderMessage(guildId, channelId, message, getClient) {
  try {
    console.log(`[REMINDER] Sending reminder to guild ${guildId}, channel ${channelId}`);
    
    const client = getClient();
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      throw new Error(`Guild ${guildId} not found`);
    }
    
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} not found or not a text channel`);
    }
    
    const sentMessage = await channel.send(message);
    
    console.log(`[REMINDER] Successfully sent reminder to ${guild.name}/#${channel.name}`);
    return { success: true, postedToThread: false, messageId: sentMessage.id };
    
  } catch (error) {
    console.error(`[REMINDER] Error sending reminder:`, error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  createAttendanceButtons,
  publishEventToDiscord,
  editEventMessage,
  deleteEventMessage,
  sendReminderMessage
};
