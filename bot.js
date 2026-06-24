const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const ROLE_ID = '965315419382611988';
const LOG_CHANNEL_ID = '839607069178200115';

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

async function sendLog(guild, message) {
  try {
    const channel = guild.channels.cache.get(LOG_CHANNEL_ID)
      || await guild.channels.fetch(LOG_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      await channel.send(message);
    }
  } catch (err) {
    console.error('Failed to send log message:', err);
  }
}

client.on('guildMemberAdd', async (member) => {
  try {
    const role = member.guild.roles.cache.get(ROLE_ID);
    if (!role) {
      console.error(`Role ${ROLE_ID} not found in guild ${member.guild.name}`);
      await sendLog(member.guild, `⚠️ Could not assign role to <@${member.id}> — role \`${ROLE_ID}\` not found.`);
      return;
    }
    await member.roles.add(role);
    console.log(`Assigned role ${role.name} to ${member.user.tag}`);
    await sendLog(member.guild, `✅ Assigned **${role.name}** to <@${member.id}> (${member.user.tag}).`);
  } catch (err) {
    console.error(`Failed to assign role to ${member.user.tag}:`, err);
    await sendLog(member.guild, `❌ Failed to assign role to <@${member.id}> (${member.user.tag}): ${err.message}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
