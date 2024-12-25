const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Replace with your bot token
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Available positions
const vacancies = {
    'Frontend Developer': {
        questions: [
            'Какой у вас опыт работы?',
            'Какие технологии вы знаете?',
            'Расскажите о вашем последнем проекте'
        ]
    },
    'Backend Developer': {
        questions: [
            'Какой у вас опыт работы?',
            'Какие языки программирования вы используете?',
            'Расскажите о сложном проекте, над которым вы работали'
        ]
    },
    'Project Manager': {
        questions: [
            'Какой у вас опыт управления проектами?',
            'Сколько человек было в самой большой команде под вашим руководством?',
            'Расскажите о успешно завершенном проекте'
        ]
    }
};

// Store user state
const userStates = new Map();

// Initialize user state
function initUserState(chatId) {
    return {
        chatId,
        currentPosition: null,
        currentQuestionIndex: 0,
        answers: [],
        voiceMessage: null,
        complete: false
    };
}

// Start command handler
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    userStates.set(chatId, initUserState(chatId));
    
    const keyboard = {
        reply_markup: {
            keyboard: Object.keys(vacancies).map(v => [v]),
            one_time_keyboard: true,
            resize_keyboard: true
        }
    };
    
    await bot.sendMessage(
        chatId,
        'Добро пожаловать! Пожалуйста, выберите интересующую вас вакансию:',
        keyboard
    );
});

// Handle vacancy selection
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userState = userStates.get(chatId);
    
    if (!userState) return;
    
    // Handle vacancy selection
    if (!userState.currentPosition && vacancies[msg.text]) {
        userState.currentPosition = msg.text;
        userState.currentQuestionIndex = 0;
        await askNextQuestion(chatId);
        return;
    }
    
    // Handle question answers
    if (userState.currentPosition && !userState.complete && msg.text) {
        userState.answers.push({
            question: vacancies[userState.currentPosition].questions[userState.currentQuestionIndex],
            answer: msg.text
        });
        
        userState.currentQuestionIndex++;
        await askNextQuestion(chatId);
    }
});

// Handle voice messages
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const userState = userStates.get(chatId);
    
    if (!userState || !userState.waitingForVoice) return;
    
    userState.voiceMessage = msg.voice.file_id;
    await saveApplication(chatId);
});

// Ask next question or request voice message
async function askNextQuestion(chatId) {
    const userState = userStates.get(chatId);
    const questions = vacancies[userState.currentPosition].questions;
    
    if (userState.currentQuestionIndex < questions.length) {
        await bot.sendMessage(
            chatId,
            questions[userState.currentQuestionIndex]
        );
    } else if (!userState.waitingForVoice) {
        userState.waitingForVoice = true;
        await bot.sendMessage(
            chatId,
            'Пожалуйста, отправьте голосовое сообщение, в котором вы рассказываете о себе или что-то продаете'
        );
    }
}

// Save application
async function saveApplication(chatId) {
    const userState = userStates.get(chatId);
    const timestamp = Date.now();
    const folderName = `applications/${chatId}_${timestamp}`;
    
    // Create folder
    fs.mkdirSync(folderName, { recursive: true });
    
    // Save answers to text file
    const answersText = userState.answers
        .map(a => `Вопрос: ${a.question}\nОтвет: ${a.answer}\n`)
        .join('\n');
    fs.writeFileSync(`${folderName}/answers.txt`, answersText);
    
    // Download and save voice message
    if (userState.voiceMessage) {
        const file = await bot.getFile(userState.voiceMessage);
        const voicePath = `${folderName}/voice_message.ogg`;
        
        // Download voice message
        const fileStream = bot.getFileStream(userState.voiceMessage);
        const writeStream = fs.createWriteStream(voicePath);
        fileStream.pipe(writeStream);
        
        writeStream.on('finish', async () => {
            await bot.sendMessage(
                chatId,
                'Спасибо! Ваша заявка успешно сохранена. Мы свяжемся с вами в ближайшее время.'
            );
            userStates.delete(chatId);
        });
    }
}

// Error handler
bot.on('polling_error', (error) => {
    console.error(error);
});
