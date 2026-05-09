import { mastra } from './src/mastra';

async function test() {
    const agent = mastra.getAgent('sqlAgent');
    const message = "какие продажи были за последний день за который есть информация в базе";
    
    console.log('Testing agent with message:', message);
    try {
        const result = await agent.generate(message);
        console.log('RESULT:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('ERROR:', e);
    }
}

test();
