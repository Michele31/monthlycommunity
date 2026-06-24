const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const ROLE_ID = '965315419382611988';
const LOG_CHANNEL_ID = '839607069178200115';

// Name template for the counter voice channel. {count} is replaced with the live number.
const COUNTER_TEMPLATE = 'Monthly Players: {count}';
// Optional: set VOICE_COUNTER_CHANNEL_ID env var to reuse an existing voice channel.
// If unset, the bot creates one automatically and reuses any it previously made.
const COUNTER_PREFIX = 'Monthly Players:';

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    await updateCounter(guild);
  }
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

async function getCounterChannel(guild) {
  // Prefer an explicitly configured channel.
  if (process.env.VOICE_COUNTER_CHANNEL_ID) {
    try {
      return guild.channels.cache.get(process.env.VOICE_COUNTER_CHANNEL_ID)
        || await guild.channels.fetch(process.env.VOICE_COUNTER_CHANNEL_ID);
    } catch (err) {
      console.error('Configured VOICE_COUNTER_CHANNEL_ID not found:', err.message);
    }
  }
  // Otherwise find a voice channel the bot already created (by prefix).
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name.startsWith(COUNTER_PREFIX)
  );
  if (existing) return existing;
  // Create a new one, locked so members can't join (display-only).
  try {
    return await guild.channels.create({
      name: COUNTER_TEMPLATE.replace('{count}', '0'),
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.Connect],
        },
      ],
    });
  } catch (err) {
    console.error('Failed to create counter channel:', err.message);
    return null;
  }
}

// Throttle renames per guild — Discord limits channel renames to ~2 per 10 min.
const lastUpdate = new Map();
const pending = new Map();

async function updateCounter(guild) {
  try {
    await guild.members.fetch();
    const role = guild.roles.cache.get(ROLE_ID) || await guild.roles.fetch(ROLE_ID);
    const count = role ? role.members.size : 0;
    const channel = await getCounterChannel(guild);
    if (!channel) return;

    const desiredName = COUNTER_TEMPLATE.replace('{count}', String(count));
    if (channel.name === desiredName) return;

    const now = Date.now();
    const last = lastUpdate.get(guild.id) || 0;
    const minGap = 5 * 60 * 1000; // 5 minutes between renames

    if (now - last < minGap) {
      // Schedule a single deferred update.
      if (!pending.has(guild.id)) {
        const delay = minGap - (now - last);
        pending.set(guild.id, setTimeout(() => {
          pending.delete(guild.id);
          updateCounter(guild);
        }, delay));
      }
      return;
    }

    await channel.setName(desiredName);
    lastUpdate.set(guild.id, Date.now());
    console.log(`Updated counter for ${guild.name}: ${count}`);
  } catch (err) {
    console.error('Failed to update counter:', err.message);
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
  updateCounter(member.guild);
});

client.on('guildMemberRemove', (member) => {
  updateCounter(member.guild);
});

// Catch manual role grants/removals.
client.on('guildMemberUpdate', (oldMember, newMember) => {
  const had = oldMember.roles.cache.has(ROLE_ID);
  const has = newMember.roles.cache.has(ROLE_ID);
  if (had !== has) {
    updateCounter(newMember.guild);
  }
});

// Periodic safety refresh.
setInterval(() => {
  for (const guild of client.guilds.cache.values()) {
    updateCounter(guild);
  }
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
