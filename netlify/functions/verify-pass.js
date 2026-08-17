const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    const id = (event.queryStringParameters || {}).id;
    if (!id) return {statusCode:400,headers:{"Content-Type":"application/json"},body:JSON.stringify({ok:false,error:"Missing delegate ID"})};

    const store=getStore("delegate-registrations");
    const data=await store.get(id,{type:"json"});
    if(!data) return {statusCode:404,headers:{"Content-Type":"application/json"},body:JSON.stringify({ok:false,verified:false,error:"Pass not found"})};

    return {
      statusCode:200,
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        ok:true,
        verified:data.status==="verified",
        delegateId:data.delegateId,
        name:data.name,
        eventDate:data.eventDate,
        venue:data.venue,
        status:data.status
      })
    };
  } catch(e) {
    console.error(e);
    return {statusCode:500,body:JSON.stringify({ok:false,error:"Verification server error"})};
  }
};
