const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const ROLE_ID = '965315419382611988';

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  try {
    const role = member.guild.roles.cache.get(ROLE_ID);
    if (!role) {
      console.error(`Role ${ROLE_ID} not found in guild ${member.guild.name}`);
      return;
    }
    await member.roles.add(role);
    console.log(`Assigned role ${role.name} to ${member.user.tag}`);
  } catch (err) {
    console.error(`Failed to assign role to ${member.user.tag}:`, err);
  }
});

client.login(process.env.DISCORD_TOKEN);
