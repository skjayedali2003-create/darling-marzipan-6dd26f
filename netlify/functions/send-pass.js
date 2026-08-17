const Busboy = require("busboy");
const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode:405, body:"Method Not Allowed" };

  try {
    const contentType = event.headers["content-type"] || event.headers["Content-Type"] || "";
    const fields = {};
    let fileBuffer = null, fileName = "", fileType = "";

    if (contentType.includes("multipart/form-data")) {
      await new Promise((resolve, reject) => {
        const bb = Busboy({headers:{"content-type":contentType}});
        bb.on("field",(name,value)=>{fields[name]=value;});
        bb.on("file",(name,file,info)=>{
          const chunks=[];
          fileName=info.filename||"";
          fileType=info.mimeType||"application/octet-stream";
          file.on("data",c=>chunks.push(c));
          file.on("end",()=>{fileBuffer=Buffer.concat(chunks);});
        });
        bb.on("error",reject);
        bb.on("finish",resolve);
        bb.end(Buffer.from(event.body||"",event.isBase64Encoded?"base64":"utf8"));
      });
    } else Object.assign(fields,JSON.parse(event.body||"{}"));

    const d=fields;
    const registration={
      ...d,
      status:"pending",
      createdAt:new Date().toISOString(),
      screenshotUrl:""
    };

    // Optional screenshot storage.
    if(fileBuffer && process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET){
      const fd=new FormData();
      fd.append("file",new Blob([fileBuffer],{type:fileType}),fileName);
      fd.append("upload_preset",process.env.CLOUDINARY_UPLOAD_PRESET);
      const r=await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,{method:"POST",body:fd});
      if(r.ok){
        const j=await r.json();
        registration.screenshotUrl=j.secure_url||"";
      }
    }

    // Persist registration in Netlify Blobs.
    const store=getStore("delegate-registrations");
    await store.setJSON(registration.delegateId,registration);

    const message=`Students Front — Delegate Registration 2026

Delegate ID: ${d.delegateId||""}
Name: ${d.name||""}
Mobile: ${d.mobile||""}
WhatsApp: ${d.whatsapp||""}
Email: ${d.email||""}
District: ${d.district||""}
College/Unit: ${d.unit||""}
Role: ${d.role||""}
Accommodation: ${d.stay||""}
Arrival: ${d.arrival||""}
Payment: ${d.payment||""}
UTR: ${d.utr||""}
Fee: ${d.fee||""}
Date: ${d.eventDate||""}
Venue: ${d.venue||""}

Status: PAYMENT VERIFICATION PENDING
${registration.screenshotUrl ? "\nPayment Screenshot: "+registration.screenshotUrl : ""}`;

    const delivery={email:false,whatsapp:false,screenshot:!!registration.screenshotUrl};

    if(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.ADMIN_EMAIL){
      const r=await fetch("https://api.resend.com/emails",{
        method:"POST",
        headers:{"Authorization":`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json"},
        body:JSON.stringify({from:process.env.EMAIL_FROM,to:[process.env.ADMIN_EMAIL],subject:`New Delegate Registration — ${d.delegateId||""}`,text:message})
      });
      delivery.email=r.ok;
    }

    if(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.ADMIN_WHATSAPP){
      const r=await fetch(`https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{
        method:"POST",
        headers:{"Authorization":`Bearer ${process.env.WHATSAPP_TOKEN}`,"Content-Type":"application/json"},
        body:JSON.stringify({messaging_product:"whatsapp",to:process.env.ADMIN_WHATSAPP,type:"text",text:{body:message}})
      });
      delivery.whatsapp=r.ok;
    }

    return {statusCode:200,headers:{"Content-Type":"application/json"},body:JSON.stringify({ok:true,delivery})};
  } catch(e) {
    console.error(e);
    return {statusCode:500,body:JSON.stringify({ok:false,error:"Server error"})};
  }
};
