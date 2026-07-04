// npm install express @sendgrid/mail cors
const express = require('express');
const sgMail = require('@sendgrid/mail');
const cors = require('cors');
const app = express();
app.use(cors(), express.json({limit:'5mb'}));

app.post('/send-invoice', async (req,res)=>{
  const { apiKey, to, subject, html } = req.body;
  sgMail.setApiKey(apiKey);
  try{
    await sgMail.send({
      to,
      from: 'ton-email-verifie@tondomaine.com', // doit être vérifié dans SendGrid
      subject,
      html
    });
    res.sendStatus(200);
  }catch(e){ res.status(500).send(e.message); }
});

app.listen(3000, ()=>console.log('proxy actif sur :3000'));
