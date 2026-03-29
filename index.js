require('dotenv').config();

const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  Events, 
  EmbedBuilder, 
  AttachmentBuilder 
} = require('discord.js');
const fs = require('fs');

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

const TOKEN = process.env.TOKEN;
const ASSIST_CHANNELS = process.env.ASSIST_CHANNELS.split(',');

// database
let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

// buttons
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('in')
    .setLabel('IN')
    .setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setCustomId('out')
    .setLabel('OUT')
    .setStyle(ButtonStyle.Danger)
);

// COMMANDS
client.on('messageCreate', async (msg) => {
  if (!msg.guild) return;

  // PANEL
  if (msg.content === '!panel') {
    const file = new AttachmentBuilder('./assets/design.gif');

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle("Fury Management System")
      .setDescription("Click (IN) to start the timer on voice, and you need to click (IN) every 30min")
      .setImage('attachment://design.gif')
      .setFooter({ text: "Fury RP" });

    msg.channel.send({
      embeds: [embed],
      files: [file],
      components: [row]
    });
  }

  // LEADERBOARD
  if (msg.content === '!leaderboard') {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].total - a[1].total);

    let description = '';

    if (sorted.length === 0) {
      description = 'No leaderboard data yet!';
    } else {
      for (let i = 0; i < sorted.length; i++) {
        const userId = sorted[i][0];
        const points = sorted[i][1].total;
        description += `**${i + 1}.** <@${userId}> — **${points} points**\n`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('🏆 Fury Leaderboard (1 point = 5min)')
      .setDescription(description)
      .setFooter({ text: 'Fury Management System' })
      .setTimestamp();

    msg.channel.send({ embeds: [embed] });
  }

  // RESET
  if (msg.content === '!resetpoints') {
    for (const userId in data) {
      data[userId].total = 0;
    }

    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🏆 Fury Leaderboard Reset')
      .setDescription('All points have been reset to 0!')
      .setTimestamp()
      .setFooter({ text: 'Fury Management System' });

    msg.channel.send({ embeds: [embed] });
  }
});

// BUTTON HANDLER
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (!data[userId]) {
    data[userId] = { total: 0, active: false, lastClick: 0 };
  }

  const member = interaction.guild.members.cache.get(userId);
  const inAssist = member.voice.channelId && ASSIST_CHANNELS.includes(member.voice.channelId);

  if (interaction.customId === 'in') {
    if (!inAssist) {
      return interaction.reply({ content: '❌ You must be in an assist voice channel!', ephemeral: true });
    }

    data[userId].active = true;
    data[userId].lastClick = Date.now();

    interaction.reply({ content: '✅ Timer started!', ephemeral: true });
  }

  if (interaction.customId === 'out') {
    data[userId].active = false;
    data[userId].lastClick = 0;

    interaction.reply({ content: '⛔ Timer stopped!', ephemeral: true });
  }

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
});

// TIMER LOOP (ANTI-CHEAT INCLUDED)
setInterval(async () => {
  const now = Date.now();

  for (const userId in data) {
    const user = data[userId];
    if (!user.active) continue;

    let member = null;

    for (const guild of client.guilds.cache.values()) {
      const m = guild.members.cache.get(userId);
      if (m) {
        member = m;
        break;
      }
    }

    // Not in VC
    if (!member || !member.voice.channelId) {
      user.active = false;
      user.lastClick = 0;
      continue;
    }

    const inAssist = ASSIST_CHANNELS.includes(member.voice.channelId);

    // Not in assist VC
    if (!inAssist) {
      user.active = false;
      user.lastClick = 0;
      continue;
    }

    // 🚫 Anti-cheat (ONLY deafened)
    if (member.voice.selfDeaf) {
      user.active = false;
      user.lastClick = 0;

      try {
        const userObj = await client.users.fetch(userId);
        await userObj.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('🚫 Anti-Cheat Triggered')
              .setDescription('You were deafened.\nTimer has been stopped.')
              .setTimestamp()
          ]
        });
      } catch (err) {
        console.log(`DM failed: ${userId}`);
      }

      continue;
    }

    // ⏰ 30 MIN TIMEOUT
    if (now - user.lastClick > 30 * 60 * 1000) {
      user.active = false;
      user.lastClick = 0;

      try {
        const userObj = await client.users.fetch(userId);
        await userObj.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('⛔ Timer Stopped')
              .setDescription('You did not click (IN) within 30 minutes.\nTimer stopped.')
              .setTimestamp()
          ]
        });
      } catch (err) {
        console.log(`DM failed: ${userId}`);
      }

      continue;
    }

    // ✅ GIVE POINT
    user.total += 1;
  }

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}, 5 * 60 * 1000);

// READY
client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);
});

// AUTO STOP IF LEAVE VC
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (oldState.member.user.bot) return;

  const userId = oldState.member.id;

  const leftAssist =
    oldState.channelId &&
    ASSIST_CHANNELS.includes(oldState.channelId) &&
    (!newState.channelId || !ASSIST_CHANNELS.includes(newState.channelId));

  if (leftAssist && data[userId] && data[userId].active) {
    data[userId].active = false;
    data[userId].lastClick = 0;

    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

    try {
      await oldState.member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⛔ Timer Stopped')
            .setDescription('You left the assist voice channel.\nTimer stopped.')
            .setTimestamp()
        ]
      });
    } catch (err) {
      console.log(`DM failed`);
    }
  }
});

client.login(TOKEN);