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

// simple database
let data = {};
if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json'));
}

// create buttons
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

// Panel, leaderboard, and resetpoints commands
client.on('messageCreate', async (msg) => {
  if (!msg.guild) return;

  // Panel command
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

  // Leaderboard command
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

  // Reset points command
  if (msg.content === '!resetpoints') {
    for (const userId in data) {
      data[userId].total = 0; // reset points
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

// Button handler
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

// Timer loop (5 minutes = 1 point)
setInterval(() => {
  const now = Date.now();

  for (const userId in data) {
    const user = data[userId];
    if (!user.active) continue;

    // auto stop after 30 min inactivity
    if (now - user.lastClick > 30 * 60 * 1000) {
      user.active = false;
      continue;
    }

    user.total += 1; // 1 point per 5 minutes
  }

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}, 5 * 60 * 1000); // every 5 minutes

// Startup event
client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);
  // No startup embed sent anymore
});

// Auto-stop timer if user leaves assist channel
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (oldState.member.user.bot) return;

  const userId = oldState.member.id;
  const leftAssistChannel =
    oldState.channelId &&
    ASSIST_CHANNELS.includes(oldState.channelId) &&
    (!newState.channelId || !ASSIST_CHANNELS.includes(newState.channelId));

  if (leftAssistChannel && data[userId] && data[userId].active) {
    data[userId].active = false;
    data[userId].lastClick = 0;

    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    console.log(`⛔ Auto-stopped timer for ${oldState.member.user.tag}`);

    try {
      await oldState.member.send('⛔ Your timer has been stopped because you left the assist voice channel.');
    } catch (err) {
      console.log(`Failed to send DM to ${oldState.member.user.tag}:`, err);
    }
  }
});

client.login(TOKEN);