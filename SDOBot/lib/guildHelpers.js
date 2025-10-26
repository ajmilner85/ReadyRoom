/**
 * GUILD HELPERS MODULE
 * Handles guild/server, role, member, and channel queries
 */

const { ensureLoggedIn, getClient } = require('./discordClient');

/**
 * Get available Discord servers (guilds)
 */
async function getAvailableGuilds() {
  try {
    await ensureLoggedIn();
    
    const client = getClient();
    const guilds = Array.from(client.guilds.cache.values()).map(guild => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true }),
      hasEventsChannel: !!guild.channels.cache.find(
        channel => channel.name === 'events' && channel.type === 0
      )
    }));
    
    return { guilds, error: null };
  } catch (error) {
    console.error('Error fetching available guilds:', error);
    return { guilds: [], error: error.message || 'Unknown error fetching guilds' };
  }
}

/**
 * Get Discord guild roles
 */
async function getGuildRoles(guildId) {
  try {
    await ensureLoggedIn();
    
    const client = getClient();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { roles: [], error: `Guild with ID ${guildId} not found or bot not added to server` };
    }

    const roles = Array.from(guild.roles.cache.values())
      .filter(role => role.name !== '@everyone')
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        managed: role.managed,
        mentionable: role.mentionable
      }))
      .sort((a, b) => b.position - a.position);

    console.log(`[DISCORD-ROLES] Fetched ${roles.length} roles for guild ${guild.name}`);
    return { roles, error: null };
  } catch (error) {
    console.error(`[DISCORD-ROLES] Error fetching roles for guild ${guildId}:`, error);
    return { roles: [], error: error.message || 'Unknown error fetching roles' };
  }
}

/**
 * Get Discord guild member information and roles
 */
async function getGuildMember(guildId, userId) {
  try {
    await ensureLoggedIn();
    
    const client = getClient();
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return { member: null, roles: [], error: `Guild with ID ${guildId} not found or bot not added to server` };
    }

    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch (fetchError) {
      return { member: null, roles: [], error: `User with ID ${userId} not found in guild ${guild.name}` };
    }

    const allRoles = Array.from(guild.roles.cache.values())
      .filter(role => role.name !== '@everyone')
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        managed: role.managed,
        mentionable: role.mentionable
      }));

    const memberData = {
      user: {
        id: member.user.id,
        username: member.user.username,
        discriminator: member.user.discriminator,
        avatar: member.user.avatar
      },
      nick: member.nickname,
      roles: member.roles.cache.map(role => role.id),
      joined_at: member.joinedAt?.toISOString(),
      premium_since: member.premiumSince?.toISOString()
    };

    console.log(`[DISCORD-MEMBER] Fetched member data for ${member.user.username} in guild ${guild.name}`);
    return { member: memberData, roles: allRoles, error: null };
  } catch (error) {
    console.error(`[DISCORD-MEMBER] Error fetching member ${userId} in guild ${guildId}:`, error);
    return { member: null, roles: [], error: error.message || 'Unknown error fetching member' };
  }
}

/**
 * Get channels for a specific guild
 */
async function getGuildChannels(guildId) {
  try {
    await ensureLoggedIn();

    const client = getClient();
    let guild = client.guilds.cache.get(guildId);

    // If not in cache, try to fetch it
    if (!guild) {
      console.log(`[GET-GUILD-CHANNELS] Guild ${guildId} not in cache, attempting to fetch...`);
      try {
        guild = await client.guilds.fetch(guildId);
        console.log(`[GET-GUILD-CHANNELS] Successfully fetched guild: ${guild.name}`);
      } catch (fetchError) {
        console.error(`[GET-GUILD-CHANNELS] Failed to fetch guild:`, fetchError);
        throw new Error(`Discord server with ID ${guildId} not found or bot doesn't have access`);
      }
    }

    if (!guild) {
      throw new Error(`Discord server with ID ${guildId} not found or bot doesn't have access`);
    }

    const channels = Array.from(guild.channels.cache.values())
      .filter(channel => channel.type === 0) // 0 = text channel
      .map(channel => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        position: channel.position,
        parentId: channel.parentId,
        parent: channel.parent ? channel.parent.name : null
      }))
      .sort((a, b) => a.position - b.position);

    return { success: true, channels };
  } catch (error) {
    console.error('[GET-GUILD-CHANNELS] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get event attendance for an event (from in-memory cache)
 */
function getEventAttendance(discordMessageId, eventResponses) {
  return eventResponses.get(discordMessageId) || null;
}

module.exports = {
  getAvailableGuilds,
  getGuildRoles,
  getGuildMember,
  getGuildChannels,
  getEventAttendance
};
