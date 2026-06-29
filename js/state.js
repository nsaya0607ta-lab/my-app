export const S = {screen:"select", cert:null, mode:"exam", coins:0,
  infra:{ vnet:false, vnetPrefix:"", subnets:[], lb:false },
  clearedMissions:[],
  deck:[], idx:0, picks:[], sel:[], revealed:false, last:null};

export const state = {
  practicePick:false,
  db:null, currentUserId:null, currentUser:null,
  authReady:false, guestMode:false, authMode:"signup", authBusy:false,
  cloudData:null, profileChecked:false,
  unsub:null, lbAutoDone:false,
};
