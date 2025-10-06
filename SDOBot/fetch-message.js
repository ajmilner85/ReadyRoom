/**
 * Quick script to fetch a Discord message and log its raw data
 */

const path = require('path');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');

// Load environment variables
const envLocalPath = path.resolve(__dirname, '../.env.local');
const envPath = path.resolve(__dirname, '../.env');

let result = dotenv.config({ path: envLocalPath });
if (result.error) {
  result = dotenv.config({ path: envPath });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log('Bot is ready!');

  // Parse from Discord message link: https://discord.com/channels/268876258023047168/1244750420400803921/1424457276214739024
  const guildId = '268876258023047168';
  const channelId = '1244750420400803921';
  const messageId = '1424457276214739024';

  try {
    console.log('Fetching guild...');
    const guild = await client.guilds.fetch(guildId);
    console.log(`Found guild: ${guild.name}`);

    console.log('Fetching channel...');
    const channel = await guild.channels.fetch(channelId);
    console.log(`Found channel: ${channel.name}`);

    console.log('Fetching message...');
    const message = await channel.messages.fetch(messageId);

    console.log('\n=== MESSAGE DATA ===\n');
    console.log('Content:', message.content);
    console.log('\n=== EMBEDS ===\n');

    if (message.embeds && message.embeds.length > 0) {
      message.embeds.forEach((embed, index) => {
        console.log(`\nEmbed ${index + 1}:`);
        console.log(JSON.stringify(embed.toJSON(), null, 2));
      });
    } else {
      console.log('No embeds found');
    }

    // Write to file for easier viewing
    const fs = require('fs');
    const output = {
      content: message.content,
      embeds: message.embeds.map(e => e.toJSON())
    };

    fs.writeFileSync(
      path.join(__dirname, 'message-data.json'),
      JSON.stringify(output, null, 2)
    );

    console.log('\n\nMessage data saved to message-data.json');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
});

// Use production token to access production guilds
const token = process.env.BOT_TOKEN_PROD || process.env.BOT_TOKEN;
console.log('Using token:', token ? 'Found' : 'Missing');
client.login(token);
