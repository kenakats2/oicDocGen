var fs = require("fs");
var fileName="";
var info;

//modules
var {ipcRenderer} = require('electron');

//default behavior when window is loaded
window.onload = function () {
  info = document.getElementById('info');
  info2 = document.getElementById('info2');
  msg("Step1: select iar file from your PC</br>"+
    "Step2: extract configuration (This process takes some time)");
};

function getReplyAsync(){

  //When receiving the javascript object async
  ipcRenderer.on("asyncReply",(event, arg) => {
    if (arg == 1){
      msg("Note :This application only supports</br>" +
        " App Driven Orchestration and Scheduled Orchestration.</br>" +
        "Maybe this iar file is not of either type");
      window.alert("Application Error !");
    }else{
      //Write message to info
      msg("Completed !");

      //Write JSON to info2	  
      msg2(JSON.stringify(arg,null,2));
    
      //Highlight json
      document.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightBlock(block);
      });
   }
  });
}
  
function extractConfig(){
  if(fileName !=""){
    ipcRenderer.send("extractConfig",fileName);
    msg("Processing, please wait…");
    getReplyAsync();
  }else{
    msg("Please select a file first");
  }
}

function fileUpload(){
  const dialog = require('electron').remote.dialog;
  let filenames = dialog.showOpenDialog(null, {
    properties: ['openFile'],
    title: 'Select a iar file',
    defaultPath: '.',
    filters: [{name: 'iar file', extensions: ['iar']}]
  });
  if (filenames == undefined){
    fileName="";
    msg("File not selected yet"); 
  }else{
    fileName=filenames;
    msg("Selected file: "+fileName);
  }
}

function msg(msg){
  info.innerHTML = "<b>"+msg+"</b>";
}

function msg2(msg){
  info2.innerHTML = msg;
}

function copyFunction() {
  const copyText = document.getElementById("info2").textContent;
  const textArea = document.createElement('textarea');
  textArea.textContent = copyText;
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  window.alert("Copied to your clipboard");
}

function isExistFile(filePath) {
  try {
    fs.statSync(filePath);
    console.log(filePath);
    return true
  } catch(err) {
    if(err.code === 'ENOENT') return false
  }
}


function openChildWindow(){
  if (!isExistFile(__dirname+"/../mmd/child.mmd")){
    msg("Please Extract iar file first !");
  }else{
  const url = "../html/child.html";
  window.open(url, '', 'width=300,height=300');
  }
}


