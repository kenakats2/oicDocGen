//load modules
const fs = require("fs");
const extract = require("extract-zip");
const path = require("path");
const traverse = require("traverse");
const xml2js = require("xml2js");
const rimraf = require("rimraf");
const electron = require("electron");

//load app fron electron
const app = electron.app;

//create browser object from electron
const BrowserWindow = electron.BrowserWindow;
let mainWindow;

//set object for ipc
const {ipcMain} = require("electron");

//selected iar file info
var oicAppName;
var oicConfPath;

//oic config file from iar file
var layoutJson;
var projectJson;
var actionParamsJson;
var rootObj={"flow":"","globalFault":""};

//IF-branch serial number
var branchNum = 1;
var branchArray = [];
var branchPrefix = "I";

//Array for managing nested forLoop
var forArray = [];

//Array for managing nested while
var whileArray = [];

//init event when process starts
//fork renderer process and load html
app.on("ready",function(){
  //create main window with width and height
  mainWindow = new BrowserWindow({"webPreferences": {"nodeIntegration":true},"width":800,"height":600});
  //load first html file from local
  mainWindow.loadURL("file://"+ __dirname +"/html/index.html");
  //behavior when window closed
  mainWindow.on("closed",function(){
    mainWindow = null;
    });
});

//when all window are closed
app.on("window-all-closed",function() {  
  if (isExistFile(__dirname+"/mmd/child.mmd")){
    fs.unlinkSync(__dirname+"/mmd/child.mmd");
  }
  app.quit();
});
 

ipcMain.on("extractConfig",function(event,arg){
  //Selected iar file path
  var source = arg[0];

  //Unzip iar file to current directory temporary(./js);
  extract(source,{dir: __dirname},function(){
    //Get OIC app name from file name
    oicAppName = path.basename(arg[0],path.extname(source));

    //Get path where the layout.json and project.xml is located	  
    oicConfPath = __dirname+"/icspackage/project/"+oicAppName+"/PROJECT-INF/"
    
    if (!isExistFile(oicConfPath+"layout.json")){
      event.sender.send("asyncReply",1);
      removeDir(__dirname+"/icspackage");
    }else{
      //Parse layout.json to JSON Object	  
      layoutJson = JSON.parse(fs.readFileSync(oicConfPath+"layout.json","utf8"));
      initLayout();

      //Parse project.xml to javascript object	  
      xml2js.parseString(fs.readFileSync(oicConfPath+"project.xml","utf8"),function(err,result){
	projectJson = result
      });
      
      //Read configuration file(./js/actionParams.json)
      actionParamsJson = JSON.parse(fs.readFileSync(__dirname+"/js/actionParams.json","utf8"));
      
      //Main funtion: If you pass "true" as an argument, you will get the settings of globalfault to rootObj
      mainFunc(false);
      mainFunc(true);
      if (isExistFile(__dirname+"/mmd/child.mmd")){
        fs.unlinkSync(__dirname+"/mmd/child.mmd");
      }
      createMmdFile("flow");
      createMmdFile("globalFault");
	    
      //Send a javascript object data to renderer proces
      event.sender.send("asyncReply",rootObj);
      
      //Remove temporary data
      removeDir(__dirname+"/icspackage");}
  });
});


function initLayout(){
  if (layoutJson["globalCatchAll"]!=undefined){
    var regSt = new RegExp("^sr[0-9]{1,}$|^r[0-9]{1,}$");
    for (var i in layoutJson["globalCatchAll"]["children"]){
      var left=layoutJson["globalCatchAll"]["children"][i]["id"];
      for (var j in layoutJson["children"]){
	var right=layoutJson["children"][j]["id"];
	if (left==right){
	  if (regSt.test(left)){
	    layoutJson["globalCatchAll"]["children"].splice(i,1);
	  }else{
	    layoutJson["children"].splice(j,1);
	  }
	}
      }
    }
  }
}



function createMmdFile(writeDest){
  if(writeDest == "flow"){
    var mmdDocArray =["graph TB","subgraph mainFlow"];
  }else{
    var mmdDocArray =["subgraph globalFault"];
  }

  var regIf = new RegExp("^s[0-9]{1,}$");
  var regBranch = new RegExp("^sc[0-9]{1,}$");
  var regStopC = new RegExp("^st[0-9]{1,}$|^t[0-9]{1,}.ed$|^ta[0-9]{1,}.ed$");
  var regStopN = new RegExp("^t[0-9]{1,}_begin$|^ta[0-9]{1,}_begin$");

  for (var i=0; i<rootObj[writeDest].length-1; i++){
    var tmp = rootObj[writeDest][i];
    var tmpN = rootObj[writeDest][i+1];
    var right="\")";
    var left="(\"";

    for (var j=0; j<tmp["next"].length; j++){
      if (tmp["next"][j] != "none"){
        if (regIf.test(tmp["id"])){
          left ="{\"";
          right = "\"}";
          message=tmp["name"]+"("+tmp["description"]+")";
          mmdDocArray.push("  "+tmp["id"]+left+message+right+"-->"+tmp["next"][j]+"((stop))");
        }else if (regBranch.test(tmp["id"])){
          left ="(\"";
          right = "\")";
          tmp["description"]=tmp["description"].replace(/\(|\)|/g,"");
          tmp["description"]=tmp["description"].replace(/\"/g,"'");

          message=tmp["name"]+"("+tmp["description"]+")"
          mmdDocArray.push("  "+tmp["id"]+left+message+right+"-->"+tmp["next"][j]+"((stop))");
          mmdDocArray.push("  style "+tmp["id"]+ " #f00,stroke:#fff,stroke-width:5px;");
          mmdDocArray.push("");
        }else{
          tmp["description"]=tmp["description"].replace(/\(|\)|\"/g,"");
          message=tmp["name"]+"</br>"+"("+tmp["description"]+")"
          mmdDocArray.push("  "+tmp["id"]+left+message+right+"-->"+tmp["next"][j]+"((stop))");
        }
      }
    }
  }
  mmdDocArray.push("end");
	
  for(i in mmdDocArray){
    fs.appendFileSync(__dirname+"/mmd/child.mmd",mmdDocArray[i]+"\n");
  }
}

function getActionName(json,refUri){
  var actionName;
  traverse(json).forEach(function (x) {
    if (typeof x["\$"] == "object" && x["\$"]["name"] == refUri){
      if (/^processor_[0-9]{1,}/.test(refUri)){
        actionName = x["processorName"][0];
      }else if (/^application_[0-9]{1,}/.test(refUri)){
        actionName = x["adapter"][0]["name"][0];
      }
    }
  });
  return actionName;
}

function getLabelName(json,id){
  var labelName;
  traverse(json).forEach(function (x) {
    if (typeof x == "object" && x["id"] == id){
      labelName = x["name"];
    }
  });
  return labelName;
}

function getAssignments(json,id){
  var assignments=[];
  traverse(json).forEach(function (x) {
    if (typeof x["\$"] == "object" && x["\$"]["id"] == id){
      for(var i in x["assignment"]){
        var refUri = x["assignment"][i]["\$"]["refUri"];
	var locations = getLocations(json,refUri);
	var properties = readProperty(locations[0],[6,7]);
	assignments.push(properties[0]+properties[1]);
      }
    }
  });
  return assignments;
}

function getLocations(json,refUri){

  var locations=[];
  traverse(json).forEach(function (x) {
    if (typeof x == "string" && x.includes("/"+refUri+"/")){
      locations.push(oicConfPath+x);
    }
  });
  return locations;
}

function readProperty(filePath,arrayOfIndex){

  var propertyFile = fs.readFileSync(filePath,"utf8").split(/\r\n|\r|\n/);
  var properties = [];
  for (var i in arrayOfIndex){
    var property = propertyFile[arrayOfIndex[i]];
    property = property.slice(property.indexOf(": ")+1);
    properties.push(property);
  }
  return properties;
}

function readWsl(filePath){
  var properties = [];
  var wslJson;
  xml2js.parseString(fs.readFileSync(filePath,"utf8"),function(err,result){
    wslJson = result
  });
  properties.push(wslJson["xsl:stylesheet"]["\$"]["xmlns:nstrgmpr"].split("/").slice(-2)[0]);
  return properties;
}

function getRefUri(json,id){
  var refUri;
  traverse(json).forEach(function (x) {
    if (typeof x == "object" && x["id"] == id){
      refUri = x["refUri"];
    }
  });
  return refUri;
}

function removeDir(filePath) {
  rimraf(filePath, function(error){})
}

function isExistFile(filePath) {
  try {
    fs.statSync(filePath);
    return true
  } catch(err) {
    if(err.code === 'ENOENT') return false
  }
}

//Main function
function mainFunc(faultFlag){
  var tmpArray= [];
  var flowArray = [];
  var writeDest;

  if (!faultFlag){
    tmpArray = layoutJson["children"];
    writeDest = "flow";
  }else{
    if (layoutJson["globalCatchAll"] != undefined) {
      tmpArray = layoutJson["globalCatchAll"]["children"];  
    }
    writeDest = "globalFault";
  }

  for (var i in tmpArray){
    var layoutObj = tmpArray[i];
    for (var j in actionParamsJson){
      var reg = new RegExp(actionParamsJson[j]["id"]);
      if (reg.test(layoutObj["id"])){
        var actionType = actionParamsJson[j]["actionType"];
        var description = actionParamsJson[j]["description"];
	var next=[];
	var tmpObj = {
	  "id": layoutObj["id"].replace(".end",".ed"),
          "name": "-",
	  "next": next,
          "description": actionParamsJson[j]["description"],
          "detail": "-" }

        var delFlag=false;
	
        switch (actionType) {
          //Invoke
          case 1:
            var refUri = getRefUri(projectJson,layoutObj["id"]);
	    //ToDo
            tmpObj["name"] = getActionName(projectJson,refUri);
            break;

          //Assignment
          case 2:
            tmpObj["name"] = getLabelName(projectJson,layoutObj["id"]);
            tmpObj["detail"] = getAssignments(projectJson,layoutObj["id"]);
            break;

          //IF-branch: condition
          case 3:
            var refUri = getRefUri(projectJson,layoutObj["id"]);
            var locations = getLocations(projectJson,refUri);
	    tmpObj["name"] = branchPrefix+branchArray.slice(-1)[0]+"-branch";
	    if (branchArray.slice(-1)[0]==undefined){
	      delFlag=true;
	      break;
	    }
            tmpObj["description"] = actionParamsJson[j]["description"]+readProperty(locations[0],[0])[0];
            break;

          //IF-branch: Start
          case 4:
	    var branchChild = 1;
            branchArray.push(branchNum);
            tmpObj["name"] = branchPrefix+branchArray.slice(-1)[0];
            branchNum++;
            break;

          //IF-branch : End
          case 5:
            tmpObj["name"] = branchPrefix+branchArray.slice(-1)[0]+"-end";
            branchArray.pop();
            break;

          //ForLoop: Start
          case 6:
            var refUri = getRefUri(projectJson,layoutObj["id"]);
            var actionName = getActionName(projectJson,refUri);
	    tmpObj["name"] = actionName;
            forArray.push(actionName);
            break;

          //ForLoop : End
          case 7:
	    tmpObj["name"] = forArray.slice(-1)[0];
            forArray.pop();
            break;

          //Mapping
          case 8:
            var refUri = getRefUri(projectJson,layoutObj["id"]);
            var locations = getLocations(projectJson,refUri);
            for (var k in locations){
              if (path.extname(locations[k])==".xsl"){
                tmpObj["name"] = readWsl(locations[k])[0];
                break;
              }
            }
            break;

          //Trigger
          case 9:
            var refUri = getRefUri(projectJson,layoutObj["id"]).split("/")[0];
            tmpObj["name"] = getActionName(projectJson,refUri);
            break;

          //While: Start
          case 10:
            var refUri = getRefUri(projectJson,layoutObj["id"]);
            var actionName = getActionName(projectJson,refUri);
            whileArray.push(actionName);
	    tmpObj["name"] = actionName;
            break;

          //While : End
          case 11:
            tmpObj["name"] = whileArray.slice(-1)[0];
            whileArray.pop();
            break;

	  //Scope
          case 12:
            tmpObj["name"] = getLabelName(projectJson,layoutObj["id"]);
            break;

	  //Logger
	  case 13:
            var refUri = getRefUri(projectJson,layoutObj["id"]);
            var locations = getLocations(projectJson,refUri);
            for (var k in locations){
              logMessage = readProperty(locations[k],[0]);
            }
            tmpObj["name"] = getActionName(projectJson,refUri);
	    tmpObj["detail"] = logMessage;
            break;

          //Other
          default:
            break;
        }
	if(tmpObj["name"]!=undefined && !(delFlag)){
          flowArray.push(tmpObj);
	}
        break;
      };
    }
  }
  rootObj[writeDest]=flowArray;

  //Tmp
  var regIf = new RegExp("^s[0-9]{1,}$");
  var regBranch = new RegExp("^sc[0-9]{1,}$");
  var regStopC = new RegExp("^st[0-9]{1,}$|^t[0-9]{1,}.ed$|^ta[0-9]{1,}.ed$");
  var regStopN = new RegExp("^t[0-9]{1,}_begin$|^ta[0-9]{1,}_begin$");
  var regScope = new RegExp("^t[0-9]{1,}$");
  var regScopeS = new RegExp("^t[0-9]{1,}_begin$");
  var regScopeF = new RegExp("^ta[0-9]{1,}$");
  
  for (var i = 0; i<rootObj[writeDest].length-1; i++){
    var currentName = rootObj[writeDest][i]["name"];
    var currentId = rootObj[writeDest][i]["id"];
    var nextId = rootObj[writeDest][i+1]["id"];
    if (regIf.test(currentId)){
      for (var j=i+1; j<rootObj[writeDest].length; j++){
        if(rootObj[writeDest][j]["name"]==currentName+"-branch"){
          rootObj[writeDest][i]["next"].push(rootObj[writeDest][j]["id"]);
          if(i != (j-1)){
            rootObj[writeDest][j-1]["next"]=[currentId+"_router.ed"];
          }
	}
      }
    }else{
      rootObj[writeDest][i]["next"].push(nextId);
    }
  }
  for (var i = 0; i<rootObj[writeDest].length-1; i++){
    var currentName = rootObj[writeDest][i]["name"];
    var currentId = rootObj[writeDest][i]["id"];
    var nextId = rootObj[writeDest][i+1]["id"];
    if(regStopC.test(currentId) || regStopN.test(nextId)){
      rootObj[writeDest][i]["next"]=["none"];
    }else if (rootObj[writeDest][i]["next"].length>1 && !(regIf.test(currentId))){
      rootObj[writeDest][i]["next"].pop();
    }else if (regScope.test(currentId)){
      var tmpNum = Number(currentId.replace("t",""));
      rootObj[writeDest][i]["next"].push(currentId+"_begin");
      rootObj[writeDest][i]["next"].push("ta"+(tmpNum+1)+"_begin");
    }
  }
}





