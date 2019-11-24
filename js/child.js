//modules
const {ipcRenderer} = require("electron");
const fs = require("fs");
const filePath = __dirname+"/../mmd/child.mmd"

const remote = require("electron").remote;
const Menu = remote.Menu;
const MenuItem = remote.MenuItem;

//default behavior when window is loaded
window.onload = function () {
  info = document.getElementById("info");
  content = fs.readFileSync(filePath,"utf8");
  msg(content);
};

function msg(msg){
  info.innerHTML = msg;
}

