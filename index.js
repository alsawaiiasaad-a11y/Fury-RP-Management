require('dotenv').config();

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

async function sendDesignEmbed(channel) {
    // Attach the GIF
    const file = new AttachmentBuilder('./assets/design.gif');
    
    // Create the embed
    const embed = new EmbedBuilder()
        .setColor(0x0099FF) // Choose any color
        .setTitle("Fury Management System") // Your embed title
        .setDescription("Click (IN) to start the timer on voice,and you need to click (IN) every 30min") // Optional description
        .setImage('attachment://design.gif') // Display the GIF
        .setFooter({ text: "Your bot name" });

    // Send the embed
    channel.send({ embeds: [embed], files: [file] });
}

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events
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

// send panel command
client.on('messageCreate', async (msg) => {
  // Only respond to commands in guilds
  if (!msg.guild) return;

  if (msg.content === '!panel') {
    // Attach the same GIF as in your startup embed
    const file = new AttachmentBuilder('./assets/design.gif');

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle("Fury Management System")
      .setDescription("Click (IN) to start the timer on voice, and you need to click (IN) every 30min")
      .setImage('attachment://design.gif')
      .setFooter({ text: "Fury RP" });

    // Send the embed + buttons
    msg.channel.send({
      embeds: [embed],
      files: [file],
      components: [row]
    });
  }

  // Leaderboard (keep the fixed version)
  if (msg.content === '!leaderboard') {
    const sorted = Object.entries(data)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    if (sorted.length === 0) return msg.channel.send('No leaderboard data yet!');

    let text = '🏆 Leaderboard:\n';
    for (let i = 0; i < sorted.length; i++) {
      let username = 'Unknown';
      try {
        const user = await client.users.fetch(sorted[i][0]);
        username = user.username;
      } catch {}
      text += `${i + 1}. ${username} - ${Math.floor(sorted[i][1].total / 60)} min\n`;
    }

    msg.channel.send(text);
  }
});
// button handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const userId = interaction.user.id;

  if (!data[userId]) {
    data[userId] = {
      total: 0,
      active: false,
      lastClick: 0
    };
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

// timer loop
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

    user.total += 60; // add 1 minute
  }

  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}, 60 * 1000);

client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);

  const channel = client.channels.cache.get("1480131154672615556");

  if (!channel) {
    console.log("Channel not found!");
    return;
  }

  sendDesignEmbed(channel);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  // ignore bots
  if (oldState.member.user.bot) return;

  const userId = oldState.member.id;

  // Did the user leave a voice channel or leave an assist channel?
  const leftAssistChannel =
    oldState.channelId &&
    ASSIST_CHANNELS.includes(oldState.channelId) &&
    (!newState.channelId || !ASSIST_CHANNELS.includes(newState.channelId));

  if (leftAssistChannel && data[userId] && data[userId].active) {
    data[userId].active = false;
    data[userId].lastClick = 0;

    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));

    console.log(`⛔ Auto-stopped timer for ${oldState.member.user.tag}`);

    // Send them a DM saying their timer stopped
    try {
      await oldState.member.send('⛔ Your timer has been stopped because you left the assist voice channel.');
    } catch (err) {
      console.log(`Failed to send DM to ${oldState.member.user.tag}:`, err);
    }
  }
});
client.login(TOKEN);