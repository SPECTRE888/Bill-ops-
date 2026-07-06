// npm install express @sendgrid/mail cors
const express = require('express');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
const app = express();
app.use(cors(), express.json({limit:'5mb'}));

app.post('/send-invoice', async (req,res)=>{
  const { apiKey, from, to, subject, html } = req.body;
  if(!apiKey || !from || !to) return res.status(400).send('apiKey, from et to sont requis.');
  sgMail.setApiKey(apiKey);
  try{
    await sgMail.send({ to, from, subject, html }); // "from" doit être un email vérifié dans SendGrid
    res.sendStatus(200);
  }catch(e){ res.status(500).send(e.message); }
});

app.listen(3000, ()=>console.log('proxy actif sur :3000'));
