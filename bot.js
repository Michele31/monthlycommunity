const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const ROLE_ID = '965315419382611988'; // role auto-assigned on join
const LOG_CHANNEL_ID = '839607069178200115';

// Each counter watches a role and keeps a voice channel name in sync with its member count.
// {count} in the template is replaced with the live number; prefix is how the bot re-finds
// the channel it created across restarts.
const COUNTERS = [
  { roleId: '965315419382611988', template: 'Monthly Players: {count}', prefix: 'Monthly Players:' },
  { roleId: '1070752356301549638', template: 'Monthly Creator: {count}', prefix: 'Monthly Creator:' },
];

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    await updateCounters(guild);
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

async function getCounterChannel(guild, counter) {
  // Find a voice channel the bot already created (by prefix).
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name.startsWith(counter.prefix)
  );
  if (existing) return existing;
  // Create a new one, locked so members can't join (display-only).
  try {
    return await guild.channels.create({
      name: counter.template.replace('{count}', '0'),
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
      ],
    });
  } catch (err) {
    console.error(`Failed to create counter channel "${counter.prefix}":`, err.message);
    return null;
  }
}

// Throttle renames per channel — Discord limits channel renames to ~2 per 10 min.
const lastUpdate = new Map();
const pending = new Map();

async function updateCounters(guild) {
  try {
    await guild.members.fetch();
  } catch (err) {
    console.error('Failed to fetch members:', err.message);
    return;
  }
  for (const counter of COUNTERS) {
    await updateCounter(guild, counter);
  }
}

async function updateCounter(guild, counter) {
  try {
    const role = guild.roles.cache.get(counter.roleId) || await guild.roles.fetch(counter.roleId);
    const count = role ? role.members.size : 0;
    const channel = await getCounterChannel(guild, counter);
    if (!channel) return;

    const desiredName = counter.template.replace('{count}', String(count));
    if (channel.name === desiredName) return;

    const key = channel.id;
    const now = Date.now();
    const last = lastUpdate.get(key) || 0;
    const minGap = 5 * 60 * 1000; // 5 minutes between renames

    if (now - last < minGap) {
      // Schedule a single deferred update for this channel.
      if (!pending.has(key)) {
        const delay = minGap - (now - last);
        pending.set(key, setTimeout(() => {
          pending.delete(key);
          updateCounter(guild, counter);
        }, delay));
      }
      return;
    }

    await channel.setName(desiredName);
    lastUpdate.set(key, Date.now());
    console.log(`Updated counter "${counter.prefix}" for ${guild.name}: ${count}`);
  } catch (err) {
    console.error(`Failed to update counter "${counter.prefix}":`, err.message);
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
  updateCounters(member.guild);
});

client.on('guildMemberRemove', (member) => {
  updateCounters(member.guild);
});

// Catch manual role grants/removals for any watched role.
client.on('guildMemberUpdate', (oldMember, newMember) => {
  const changed = COUNTERS.some(
    (c) => oldMember.roles.cache.has(c.roleId) !== newMember.roles.cache.has(c.roleId)
  );
  if (changed) {
    updateCounters(newMember.guild);
  }
});

// Periodic safety refresh.
setInterval(() => {
  for (const guild of client.guilds.cache.values()) {
    updateCounters(guild);
  }
}, 10 * 60 * 1000);

client.login(process.env.DISCORD_TOKEN);
