import prisma from './src/utils/prisma.js';
prisma.directMessage.findMany({ orderBy: { created_at: 'desc' }, take: 10, include: { sender: true } })
  .then(msgs => { console.log(JSON.stringify(msgs.map(m => ({ content: m.content, time: m.created_at, conv: m.conversation_id })), null, 2)); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
