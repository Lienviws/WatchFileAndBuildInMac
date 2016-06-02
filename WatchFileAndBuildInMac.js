/********************************************************************************
 * @function 基于node.js监听目录的js的变化
 * @author Lienviws
 * @create 2015.12.21
 * @lastModify 2016.6.2
 * @version 0.4
 * @hit 1.这里node版设置xml注释不解析，但是win版的会(可以在配置中设置)
 *      2.packAll.xml打包的时候并不能在新窗口显示log，为了防止界面过乱因此隐藏log(可以在配置中设置)
 *      3.只会监听文件内容改变，忽略重命名以及删除操作
 *******************************************************************************/

//------------ config start ------------->
var coreFunc = libFunc();
var rootPath = process.cwd() + "/";  //普通命令行里的路径
//var rootPath = "m2015/js/";    //vsCode上的路径
//全局配置
var config = {
    //忽略xml中的注释
    ignoreNote : true,
    //输出ant打包的log
    showAntLog : false,
    //过滤列表开关
    ignoreDirList : true
};
//过滤列表{Array}
var ignoreDirList = [
    "packs"
];

//监听文件映射表
var watchObjList = {};
var xmlObjList = {};
//<------------ config end -------------


//------------ main func start ------------->
var fs = require("fs");
var exec = require("child_process").exec;	//cmd
var path = require("path");
addPromiseDone();

(function(){
    console.log("当前目录: " + rootPath);
    //提前建立packs目录
    var packsDir = rootPath + "packs";
    fs.exists(packsDir,function(exists){
        if(!exists){
            fs.mkdir(packsDir);
        }
    })
    
    //先全部文件打个包
    console.log("执行ant构建:packAll.xml,请稍后...");
    antBuild("packAll.xml", "", config.showAntLog, main);
        
    function main(){
        //写文件映射列表
        readDir(rootPath)
        .then(function(files){
            Promise.all(files.map(readXml))
            .then(function(){
                //当所有文件异步读取后，输出信息
                console.log("===正在监控文件变化，使用control+c或者点击关闭按钮退出===");
            }).done();
            
            function readXml(file){
                return new Promise(function(resolve){
                    getWatchDir(file)
                    .then(function(dirList){
                        coreFunc.extend(watchObjList,dirList);
                        coreFunc.extend(xmlObjList,coreFunc.invertObjObj(dirList));
                        resolve();
                    })
                });
            }
        }).done();
        
        //针对改变过的js自动打包
        setAllWatch(function(xmlList){
            var date = coreFunc.formatDate("[yyyy.MM.dd hh:mm:ss]", new Date());
            xmlList.forEach(function(xml) {
                antBuild(xml, "-S", config.showAntLog);
                console.log(date + "执行ant构建:" + xml);
            }, this);
        });
        
        //自动打包改变过的xml
        setRootWatch("",function(filename){
            var date = coreFunc.formatDate("[yyyy.MM.dd hh:mm:ss]", new Date());
            antBuild(filename, "-S", config.showAntLog);
            console.log(date + "执行ant构建:" + filename);
        });
    }
})()
//<------------ main func end -------------


/**
 * 得到监视用的目录路径
 * @param dirName 目录路径
 * @param func 成功后的回调函数
 * @param context 上下文环境
 */
function getWatchDir(dirName, func, context){
    var supportXml = /.js.xml$/;
    
    return new Promise(function(resolve,reject){
        if(dirName.match(supportXml) == null){
             resolve({});
             return false;
        }
        
        readFile(rootPath + dirName,'utf-8')
        .then(function(data){//将xml中property属性拼回去
            var propList = getXmlNodeProp(data, "property");
            var fullDirXml = data;
            if(propList.length != 0){
                propList.forEach(function(fileset){
                    //针对xml中的变量替换${...}
                    var regexp = new RegExp("\\$\\{" + fileset.name + "\\}","g");
                    //将路径替换后硬编码进去
                    var value;
                    if(fileset.value){
                        value = fileset.value;
                    }else if(fileset.location){
                        value = fileset.location;
                    }else{
                        console.log(rootPath + dirName + ":property prop error!");
                    }
                    fullDirXml = fullDirXml.replace(regexp,value);
                })
            }
            return fullDirXml;
        })
        .then(function(fullDirXml){//得到xml中涉及到的所有路径
            var dirList = {};
            var filesetList = getXmlNodeProp(fullDirXml, "fileset");
            if(filesetList.length != 0){
                filesetList.forEach(function(item) {
                    createWatchObj(item, function(jsName, fileInfo){
                        if(fileInfo.dir == ""){//根目录的文件另外处理
                            return;
                        }
                        if(!dirList[jsName]){
                            dirList[jsName] = {};
                        }
                        //将xml名作为key
                        coreFunc.extend(dirList[jsName],fileInfo);
                    });
                }, this);
            }
            return dirList;
        })
        .then((dirList) => resolve(dirList)).done();
    });
    
    
    
    /**
     * 创建用于映射的特殊obj
     * @param item xml中的一条fileset item={dir:文件父路径,includes:目标文件}
     * @param func(js名, 合成的obj) 回调函数
     * @ps: obj={ignore:是否绝对路径,dir:统一编码后的文件父路径,xml:xml打包文件}
     */
    function createWatchObj(item, func){
        var obj = {};
        if(!item.dir) return false;
        if(!item.includes) return false;
        //修复路径
        //分组捕获:
        //1.**
        //2.js文件路径
        //3.js文件路径(不带/)
        //4.js名称
        var regexp = /(\*\*)?((.*)\/)?(.*\.js)$/;
        
        var dirInfo = item.includes.match(regexp);
        if(!dirInfo || dirInfo[1]){ //如果是"**",则目录不用变
            obj[dirName] = {
                ignore: true,
                dir: coreFunc.unifiedDir(item.dir),//统一路径的写法
                xml: dirName
            }
        }else{
            var fixDir = dirInfo[2] ? item.dir+dirInfo[2] : item.dir;
            obj[dirName] = {
                ignore: false,
                dir: coreFunc.unifiedDir(fixDir),//统一路径的写法
                xml: dirName
            }
        }
        func(dirInfo[4], obj);
    }
}

/**
 * 得到xml文件中指定节点的所有属性
 * @param xmlFile xml文件
 * @param nodeName 节点名称
 * @out object
 */
function getXmlNodeProp(xmlFile, nodeName){
	var result = [],tmpResult;
    var xml = xmlFile;
    
	var nodeRegexp = new RegExp("(<\s?)(" + nodeName + ")(.*)(\/?>)","g"); //xml节点头部的正则
	var propRegexp = /(\w*)(\s*=\s*\")([^=\n\r]*)(\")/g;   //xml节点中属性的正则
	var noteRegep = /<!--[\s\S]*?-->/g;    //html注释的正则
    
    if(config.ignoreNote){
        //删除注释
        xml = xmlFile.replace(noteRegep,"");
    }
    
	//寻找所有符合要求的节点
	var list = xml.match(nodeRegexp);
    if(list){
        list.forEach(function(element) {
			var tmp = {};
			//寻找节点中所有的属性
			while((tmpResult = propRegexp.exec(element)) != null){
				tmp[tmpResult[1]] = tmpResult[3];
			}
			result.push(tmp);
	   }, this);
    }
	return result;
}

/**
 * 监听整个目录里的所有文件(包括子目录)
 * @param callback(fileIndex) 监听处理后的回调
 */
function setAllWatch(callback){
    fs.watch(rootPath,{recursive: true},function(event, fileDir){
        //普通编译器修改文件后监听到的事件是change,然而webstorm是rename
        if(event == "change" || event == "rename"){
            if(fileDir){
                //不是js文件都不处理
                var jsReg = /\.js$/;
                if(!fileDir.match(jsReg)){
                    return;
                }
                
                //获取js文件的根目录
                var fileDirArray = fileDir.split(path.sep);
                var fileName = fileDirArray.pop();
                var fileRoot = fileDirArray.join(path.sep);
                    
                var fileIndex;
                if(fileRoot){
                    fileIndex = coreFunc.unifiedDir(fileRoot);
                    //过滤文件列表
                    if(config.ignoreDirList){
                        if(ignoreDirList.length != 0){
                            var ignoreResult = false;
                            ignoreDirList.forEach(function(name) {
                                if(fileIndex && fileIndex.indexOf(name) != -1){
                                    ignoreResult = true;
                                }
                            }, this);
                            if(ignoreResult){
                                return 0;
                            }
                        }
                    }
                }else{//js目录下的文件
                    return 0;
                }
                
                //文件节流
                coreFunc.fileThrottle(fileName,watchObjList,function(){
                    var date = coreFunc.formatDate("[yyyy.MM.dd hh:mm:ss]", new Date());
                    var logInfo = "\n" + date + "检测到JS文件变动:" + fileName;
                    console.log(logInfo);
                    
                    if(callback){
                        callback(filter(fileName, fileIndex));
                    }
                });
                
                
            }else{
                // console.log( "filename not modefied!! -20086");
            }
        }
    });
    /**
     * 过滤不符合xml配置文件目录结构的js
     * @param fileName js名字
     * @param fileIndex js所在目录
     */
    function filter(fileName, fileIndex){
        var xmlList = [];
        var xmlObjArray = watchObjList[fileName];
        for (var xml in xmlObjArray) {
            if (xmlObjArray.hasOwnProperty(xml)) {
                if(xmlObjArray[xml].ignore == true){//即路径中带"**"的
                    //查找任一父路径是否相符
                    var regexp = /(.*\/).+$/;
                    
                    var parentDir = fileIndex;
                    var childDir = coreFunc.unifiedDir(xmlObjArray[xml].dir);
                    while(parentDir){
                        if(childDir == "" || parentDir == childDir){
                            xmlList.push(xml);
                            break;
                        }
                        parentDir = parentDir.match(regexp);
                        parentDir = parentDir && parentDir[1];
                    }
                }else{//即路径中不带"**"的
                    if(fileIndex == xmlObjArray[xml].dir){
                        xmlList.push(xml);
                    }
                }
            }
        }
        return xmlList;
    }
}

/**
 * 设置根目录文件监听
 * @param dir 相对当前文件的路径
 * @param callback 监听到改变后的回调
 */
function setRootWatch(dir,callback){
    fs.watch(rootPath + dir, function(event, xmlName){
        if(event == "change"){
            if(xmlName){
                //不是.js.xml文件后缀的都不处理
                if(xmlName.indexOf(".js.xml") == -1){
                    return;
                }
                
                //文件节流
                coreFunc.fileThrottle(xmlName,xmlObjList,function(){
                    var date = coreFunc.formatDate("[yyyy.MM.dd hh:mm:ss]", new Date());
                    var logInfo = "\n" + date + "检测到pack文件变动:" + xmlName;
                    console.log(logInfo);
                    
                    //重新写入xml信息
                    var oldJs = xmlObjList[xmlName];
                    
                    getWatchDir(xmlName)
                    .then(function(jsList){
                        if(jsList){
                            var invertJsList = coreFunc.invertObjObj(jsList);
                            var diff = diffFileList(oldJs,invertJsList[xmlName]);
                            //删掉没有的
                            if(diff.delete.length != 0){
                                diff.delete.forEach(function(jsName) {
                                    if(watchObjList[jsName][xmlName]){
                                        delete watchObjList[jsName][xmlName];
                                    }
                                    //删掉空的对象
                                    if(coreFunc.isEmpty(watchObjList[jsName])){
                                        delete watchObjList[jsName];
                                    }
                                }, this);
                            }
                            //添加新增的路径
                            if(diff.add.length != 0){
                                diff.add.forEach(function(jsName) {
                                    if(coreFunc.isEmpty(watchObjList[jsName])){
                                        watchObjList[jsName] = {};
                                    }
                                    watchObjList[jsName][xmlName] = jsList[jsName];
                                }, this);
                            }
                            //xml列表的暴力更新
                            delete xmlObjList[xmlName];
                            coreFunc.extend(xmlObjList, invertJsList);
                        }
                    },this);
                    if(callback){
                        callback(xmlName);
                    }
                });
            }else{
                console.log( "filename not modefied!! -10086");
            }
        }
    });
    
    /**
     * 对比文件名称差异
     */
    function diffFileList(fileList1, fileList2){
        var result = {
            delete: [],
            add: []
        };
        if(!coreFunc.isObject(fileList1) || !coreFunc.isObject(fileList2)){
            return result;
        }
        for(var dir in fileList2){
            if(Object.prototype.hasOwnProperty.call(fileList2,dir)){
                if(!fileList1[dir]){
                    result.add.push(dir);
                }
            }
        }
        for(var dir in fileList1){
            if(Object.prototype.hasOwnProperty.call(fileList1,dir)){
                if(!fileList2[dir]){
                    result.delete.push(dir);
                }
            }
        }
        return result;
    }
}

/**
 * ant打包命令
 * @param fileName 打包配置文件
 * @param args ant 打包参数
 * @param logSwitch log输出开关，默认关
 * @param callback 运行完之后的回调
 */
function antBuild(fileName, args, logSwitch, callback){
    args = args ? args : "";
    exec("ant -f " + fileName + " " + args,{
            cwd:rootPath	//指定工作路径
        },function(error, stdout, stderr){
            if(logSwitch){
                console.log(stdout);
            }
            if(callback){
                callback();
            }
    });
}

/**
 * 用promise实现的readFile
 */
function readFile(rootPath,option){
    option = option || null;
    return new Promise(function(resolve,reject){
        fs.readFile(rootPath,option,function(err,data){
            if(err){
                reject(err);
            }else{
                resolve(data);
            }
        });
    });
}

/**
 * 用promise实现的readdir
 */
function readDir(rootPath){
    return new Promise(function(resolve,reject){
        fs.readdir(rootPath,function(err,files){
            if(err){
                reject(err);
            }else{
                resolve(files);
            }
        });
    });
}

function watch(rootPath,options){
    fs.watch(rootPath,options)
}

/**
 * promise的全局保险
 */
function addPromiseDone(){
    Promise.prototype.done = function(onFulfilled, onRejected){
        this.then(onFulfilled, onRejected)
            .catch(function(reason){
                //抛出全局错误
                setTimeout(() => {throw reason},0)
            });
    }
}

/**
 * 函数工具库
 */
function libFunc(){
    return {
        /**
         * 判断是否是数组
         */
        isArray: function(obj){
            return Object.prototype.toString.call(obj) == "[object Array]";
        },
        /**
         * 判断是否是对象
         */
        isObject: function(obj){
            return typeof obj == "function" || typeof obj == "object";
        },
        /**
         * 判断是否是字符
         */
        isString: function(obj){
            return Object.prototype.toString.call(obj) == "[object String]";
        },
        /**
         * 判断是否为空
         */
        isEmpty: function(obj){
            if(obj == null){
                return true;
            }
            if(this.isArray(obj) || this.isString(obj)){
                return obj.length === 0;
            }
            if(Object.getOwnPropertyNames){
                return Object.getOwnPropertyNames(obj).length === 0;
            }
            for(var item in obj){
                if(Object.prototype.hasOwnProperty.call(obj,item)){
                    return false;
                }
            }
            return true;
        },
        /**
         * 深度继承Object中的所有属性(参考underscore)
         * @param obj 继承的子obj
         * @param(可选) [obj1,obj2,obj2...] 父obj
         */
        extend: function(obj){
            if( !this.isObject(obj)){
                return obj;
            }
            var self = this;
            var source, prop;
            for( var i = 1, length = arguments.length; i < length; i++){
                source = arguments[i];
                for( prop in source){
                    if(Object.prototype.hasOwnProperty.call(source,prop)){
                        if(obj[prop]){
                            self.extend(obj[prop],source[prop]);
                        }else{
                            obj[prop] = source[prop];
                        }
                    }
                }
            }
            return obj;
        },
        /**
         * 继承Object中的所有属性，并用object的方式保存(参考underscore)
         * @param obj 继承的子obj
         * @param(可选) [obj1,obj2,obj2...] 父obj
         */
        extendObj: function(obj){
            if( !this.isObject(obj)){
                return obj;
            }
            var source, prop;
            for( var i = 1, length = arguments.length; i < length; i++){
                source = arguments[i];
                for( prop in source){
                    if(Object.prototype.hasOwnProperty.call(source,prop)){
                        obj[prop] = obj[prop] || {};
                        obj[prop][source[prop]] = true;
                    }
                }
            }
            return obj;
        },
        /**
         * 反转复杂对象(不可逆)
         * 将对象的key作为新obj的value,对象key中的对象的key作为obj的key
         * @eg: invertObjObj({jsName:{xmlName:{ignore:true,dir:"./"}}}) --> {xmlName:jsName}
         */
        invertObjObj: function(obj){
            if( !this.isObject(obj)){
                return obj;
            }
            var result = {};
            var key;
            for( key in obj){
                if(Object.prototype.hasOwnProperty.call(obj,key)){
                    var xmlObj = obj[key];
                    for (var innerKey in xmlObj) {
                        if (xmlObj.hasOwnProperty(innerKey)) {
                            result[innerKey] = result[innerKey] || {};
                            result[innerKey][key] = true;
                        }
                    }
                }
            }
            return result;
        },
        /**
         * 将目录路径统一格式
         * @param dir 路径
         * @eg: unifiedDir("./ui/sdf") --> "ui/sdf/" 即node监听目录的格式
         */
        unifiedDir: function(dir){
            var regHead = /^\.?\/(.*)/;
            var regFoot = /(.*)\/$/;
            var fixDir = dir;
            
            var headInfo = regHead.exec(fixDir);
            if(headInfo != null){
                fixDir = headInfo[1];
            }
            var footInfo = regFoot.exec(fixDir);
            if(fixDir != "" && footInfo == null){
                fixDir += "/";
            }

            return fixDir;
        },
        /**
         * 将文件节流不让其在短时间内多次改变
         */
        fileThrottle: function(fileName, saveObj, func, time){
            if(!this.isObject(saveObj)){
                return false;
            }
            time = time || 50;
            if(saveObj[fileName]){
                clearTimeout(saveObj[fileName].timeoutId);
                saveObj[fileName].timeoutId = setTimeout(function(){
                    func();
                    delete saveObj[fileName].timeoutId;
                },time);
            }
        },
        /**
         * 格式化时间文本
         * @param {Date} text 要格式化的文本
         * @param {String} date 时间对象
         * @returns {String}
         * @example
         * $Date.format("现在是yyyy年MM月dd日 hh点mm分ss秒，星期w",new Date());
         * y 表示年份
         * M 大写M表示月份
         * d 表示几号
         * h 表示小时
         * m 表示分
         * s 表示秒
         * w 表示星期几
         **/
        formatDate: function(text, date) {
            var reg = /yyyy|yy|M+|d+|h+|m+|s+|q+|S|w/g;
            text = text.replace(reg, function (pattern) {
                var result;
                switch (pattern) {
                    case "yyyy":
                        result = date.getFullYear();
                        break;
                    case "yy":
                        result = date.getFullYear().toString().substring(2);
                        break;
                    case "M":
                    case "MM":
                        result = date.getMonth() + 1;
                        break;
                    case "dd":
                    case "d":
                        result = date.getDate();
                        break;
                    case "hh":
                    case "h":
                        result = date.getHours();
                        break;
                    case "mm":
                    case "m":
                        result = date.getMinutes();
                        break;
                    case "ss":
                    case "s":
                        result = date.getSeconds();
                        break;
                    case "q":
                        result = Math.floor((date.getMonth() + 3) / 3);
                        break;
                    case "S":
                        result = date.getMilliseconds();
                        break;
                    case "w":
                        result = "日一二三四五六".charAt(date.getDay());
                        break;
                    default:
                        result = "";
                        break;
                }
                if (pattern.length == 2 && result.toString().length == 1) {
                    result = "0" + result;
                }
                return result;
            });
            return text;
        }
    }
}