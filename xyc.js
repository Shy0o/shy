/*
------------------------------------------
@Author: Auto Generated (Modified)
@Date: 2025.11.01
@Description: gbxyc签到脚本 - 完整独立版
------------------------------------------

重写配置：
[Script]
# 获取并保存token
http-request ^https:\/\/api\.alldragon\.com\/.* script-path=alldragon.js, requires-body=true, timeout=60, tag=AllDragon获取token

# 定时签到
cron "0 9 * * *" script-path=alldragon.js, timeout=60, tag=AllDragon签到

[MITM]
hostname = api.alldragon.com

使用说明：
1. 首次使用：打开小程序，脚本会自动捕获并保存Authorization
2. 之后使用：定时任务会自动使用已保存的Authorization进行签到
3. Token失效：重新打开小程序，脚本会自动更新Authorization
*/

// ============ 环境检测 ============
const isQuantumultX = typeof $task !== "undefined";
const isSurge = typeof $httpClient !== "undefined" && !isQuantumultX;
const isLoon = typeof $loon !== "undefined";
const isNode = typeof module !== "undefined";

// ============ 基础配置 ============
const scriptName = "GBxyc签到脚本";
const ckName = "alldragon_data";
const tenantId = "4200";
const tenantCode = "xycxmall";
const clientType = "3";

// ============ 全局变量 ============
let userList = [];
let notifyMsg = [];
let notifyTitle = "";

// ============ 工具函数 ============
function log(message) {
    console.log(message);
}

function getdata(key) {
    if (isSurge || isLoon) {
        return $persistentStore.read(key);
    } else if (isQuantumultX) {
        return $prefs.valueForKey(key);
    }
    return null;
}

function setdata(value, key) {
    if (isSurge || isLoon) {
        return $persistentStore.write(value, key);
    } else if (isQuantumultX) {
        return $prefs.setValueForKey(value, key);
    }
    return false;
}

function showMsg(title, subtitle, message) {
    if (isSurge || isLoon) {
        $notification.post(title, subtitle, message);
    } else if (isQuantumultX) {
        $notify(title, subtitle, message);
    }
    log(`【通知】${title}\n${subtitle}\n${message}`);
}

function done(value = {}) {
    if (isQuantumultX) {
        $done(value);
    } else if (isSurge || isLoon) {
        $done(value);
    }
}

// HTTP请求函数
function httpRequest(options) {
    return new Promise((resolve, reject) => {
        const method = options.method || (options.body ? "POST" : "GET");
        
        if (isSurge || isLoon) {
            const _method = method.toLowerCase();
            $httpClient[_method](options, (error, response, data) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        statusCode: response.status,
                        headers: response.headers,
                        body: data
                    });
                }
            });
        } else if (isQuantumultX) {
            options.method = method;
            $task.fetch(options).then(
                response => resolve(response),
                reason => reject(reason)
            );
        }
    });
}

// Base64解码
function base64Decode(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    str = str.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    
    for (let i = 0; i < str.length;) {
        const enc1 = chars.indexOf(str.charAt(i++));
        const enc2 = chars.indexOf(str.charAt(i++));
        const enc3 = chars.indexOf(str.charAt(i++));
        const enc4 = chars.indexOf(str.charAt(i++));
        
        const chr1 = (enc1 << 2) | (enc2 >> 4);
        const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        const chr3 = ((enc3 & 3) << 6) | enc4;
        
        output += String.fromCharCode(chr1);
        if (enc3 !== 64) output += String.fromCharCode(chr2);
        if (enc4 !== 64) output += String.fromCharCode(chr3);
    }
    return output;
}

// 对象键转小写
function keysToLowerCase(obj) {
    if (!obj) return {};
    const newObj = {};
    for (let key in obj) {
        newObj[key.toLowerCase()] = obj[key];
    }
    return newObj;
}

// 双重日志
function doubleLog(message) {
    log(message);
    notifyMsg.push(message);
}

// ============ 用户类 ============
class UserInfo {
    constructor(userData, index) {
        this.index = index;
        this.authorization = userData.authorization;
        this.memberId = userData.memberId || "";
        this.userName = userData.userName || `账号${index}`;
        this.mobile = userData.mobile || "";
        this.ckStatus = true;
        this.lastError = "";
        
        this.baseUrl = "https://api.alldragon.com";
        this.headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'gzip,compress,br,deflate',
            'Host': 'api.alldragon.com',
            'Authorization': this.authorization,
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.64(0x1800402d) NetType/WIFI Language/zh_HK',
            'Referer': 'https://servicewechat.com/wxef49bf6a5aaef56a/70/page-frame.html',
            'Connection': 'keep-alive'
        };
        
        log(`[账号${this.index}]加载完成: ${this.userName}`);
    }
    
    // 发起请求
    async request(url, body = null) {
        try {
            const fullUrl = url.startsWith('http') ? url : this.baseUrl + url;
            log(`[${this.userName}]请求URL: ${fullUrl}`);
            
            const options = {
                url: fullUrl,
                headers: this.headers
            };
            
            if (body) {
                options.method = "POST";
                const formData = [];
                for (let key in body) {
                    formData.push(`${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`);
                }
                options.body = formData.join('&');
                log(`[${this.userName}]请求体: ${options.body}`);
            }
            
            const response = await httpRequest(options);
            
            // 记录响应状态
            log(`[${this.userName}]HTTP状态: ${response.statusCode || '未知'}`);
            
            // 检查响应状态码
            if (response.statusCode && response.statusCode !== 200) {
                if (response.statusCode === 404) {
                    this.lastError = `接口不存在(404): ${url}`;
                    log(`[${this.userName}]${this.lastError}`);
                    log(`[${this.userName}]请手动在小程序中签到，并查看日志找到正确的接口地址`);
                } else {
                    this.lastError = `HTTP ${response.statusCode}`;
                }
                throw new Error(this.lastError);
            }
            
            // 检查响应体
            const rawBody = response.body || '';
            
            if (!rawBody || rawBody.trim() === '') {
                this.lastError = '服务器返回空响应';
                throw new Error(this.lastError);
            }
            
            // 检查是否为HTML响应
            if (rawBody.trim().startsWith('<')) {
                log(`[${this.userName}]收到HTML响应，Token可能失效`);
                log(`[${this.userName}]响应内容: ${rawBody.substring(0, 200)}`);
                this.lastError = 'Token可能已失效，请重新获取';
                throw new Error(this.lastError);
            }
            
            // 解析JSON
            let result;
            try {
                result = JSON.parse(rawBody);
                log(`[${this.userName}]响应结果: code=${result.code}, msg=${result.msg || '无消息'}`);
            } catch (parseError) {
                log(`[${this.userName}]JSON解析失败`);
                log(`[${this.userName}]原始响应: ${rawBody.substring(0, 300)}`);
                this.lastError = `响应格式错误: ${parseError.message}`;
                throw new Error(this.lastError);
            }
            
            // 检查业务状态码
            if (result.code !== 200) {
                this.lastError = result.msg || `请求失败(code: ${result.code})`;
                throw new Error(this.lastError);
            }
            
            return result;
        } catch (e) {
            this.ckStatus = false;
            this.lastError = e.message || String(e);
            log(`[${this.userName}]请求失败: ${this.lastError}`);
            throw e;
        }
    }
    
    // 获取当前月份
    getCurrentMonth() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }
    
    // 获取用户状态
    async getUserStatus() {
        try {
            const body = {
                startTime: this.getCurrentMonth(),
                tenantId: tenantId,
                tenantCode: tenantCode,
                clientType: clientType
            };
            
            log(`[${this.userName}]获取用户状态...`);
            const result = await this.request(API_ENDPOINTS.getUserStatus, body);
            return result.data;
        } catch (e) {
            this.ckStatus = false;
            this.lastError = `获取用户状态失败: ${e.message}`;
            return null;
        }
    }
    
    // 签到
    async checkin() {
        try {
            const body = {
                tenantId: tenantId,
                tenantCode: tenantCode,
                clientType: clientType
            };
            
            log(`[${this.userName}]执行签到请求...`);
            const result = await this.request(API_ENDPOINTS.doCheckin, body);
            
            return {
                success: result.code === 200,
                msg: result.msg,
                code: result.code,
                data: result.data,
                point: result.data?.point
            };
        } catch (e) {
            this.ckStatus = false;
            this.lastError = `签到失败: ${e.message}`;
            
            // 如果是404错误，给出详细的帮助信息
            if (e.message.includes('404')) {
                this.lastError += '\n\n🔍 诊断建议:\n';
                this.lastError += '1. 在小程序中手动点击签到按钮\n';
                this.lastError += '2. 查看Surge/Loon日志中的[重要]标记行\n';
                this.lastError += '3. 找到包含"checkin"的实际接口地址\n';
                this.lastError += '4. 将正确的接口地址告诉开发者更新脚本\n';
                this.lastError += `\n当前使用接口: ${API_ENDPOINTS.doCheckin}`;
            }
            
            return {
                success: false,
                msg: this.lastError,
                code: 'ERROR'
            };
        }
    }
}

// ============ 主要功能 ============

// 获取并保存Token
async function getCookie() {
    try {
        if (!$request) {
            log("[警告]未检测到请求对象");
            return;
        }
        
        if ($request.method === 'OPTIONS') {
            log("[信息]OPTIONS请求，跳过");
            return;
        }
        
        log(`[信息]捕获到请求: ${$request.url}`);
        
        const headers = keysToLowerCase($request.headers);
        const authorization = headers.authorization;
        
        if (!authorization) {
            log("[警告]未找到Authorization");
            return;
        }
        
        log(`[成功]捕获Authorization: ${authorization.substring(0, 50)}...`);
        
        // 解析JWT Token
        let memberId = "";
        let mobile = "";
        
        try {
            const tokenParts = authorization.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(base64Decode(tokenParts[1]));
                memberId = payload.memberId || "";
                mobile = payload.mobile || "";
                
                log(`[信息]解析Token:`);
                log(`  - memberId: ${memberId}`);
                log(`  - mobile: ${mobile}`);
            }
        } catch (e) {
            log(`[警告]解析Token失败: ${e.message}`);
        }
        
        // 构建用户数据
        const newData = {
            memberId: memberId,
            mobile: mobile,
            authorization: authorization,
            userName: mobile ? `手机${mobile.slice(-4)}` : (memberId ? `用户${memberId.slice(-4)}` : "新用户"),
            updateTime: new Date().toLocaleString('zh-CN')
        };
        
        // 读取现有数据
        const savedData = getdata(ckName);
        let dataList = [];
        
        if (savedData) {
            try {
                dataList = JSON.parse(savedData);
            } catch (e) {
                log(`[警告]解析已保存数据失败: ${e.message}`);
                dataList = [];
            }
        }
        
        // 查找是否已存在
        const index = dataList.findIndex(item => item.memberId === newData.memberId);
        
        if (index !== -1) {
            // 检查Token是否有变化
            const oldToken = dataList[index].authorization;
            if (oldToken === authorization) {
                log(`[信息]${newData.userName} Token未变化，跳过保存`);
                return; // Token未变化，直接返回，不弹通知
            }
            
            // Token有变化才更新并通知
            dataList[index] = newData;
            setdata(JSON.stringify(dataList), ckName);
            showMsg(
                scriptName,
                `🔄 ${newData.userName} Token更新成功`,
                `手机: ${mobile || '未知'}\n会员ID: ${memberId}\n更新: ${newData.updateTime}`
            );
            log(`[成功]更新账号Token: ${newData.userName}`);
        } else {
            // 新账号才通知
            dataList.push(newData);
            setdata(JSON.stringify(dataList), ckName);
            showMsg(
                scriptName,
                `🎉 ${newData.userName} 添加成功`,
                `手机: ${mobile || '未知'}\n会员ID: ${memberId}\n时间: ${newData.updateTime}`
            );
            log(`[成功]新增账号Token: ${newData.userName}`);
        }
        
        log(`[成功]当前共保存 ${dataList.length} 个账号`);
        
    } catch (e) {
        log(`[错误]保存Token失败: ${e.message}`);
        showMsg(scriptName, "⛔️ 保存Token失败", e.message || String(e));
    }
}

// 加载用户数据
async function loadUsers() {
    const savedData = getdata(ckName);
    
    if (!savedData) {
        throw new Error("未找到已保存的Token，请先打开小程序获取Authorization");
    }
    
    let dataList;
    try {
        dataList = JSON.parse(savedData);
    } catch (e) {
        throw new Error("解析Token数据失败，请重新获取");
    }
    
    if (!dataList || dataList.length === 0) {
        throw new Error("未找到可用账号，请先获取Authorization");
    }
    
    log(`[信息]成功加载 ${dataList.length} 个账号`);
    
    for (let i = 0; i < dataList.length; i++) {
        if (dataList[i].authorization) {
            userList.push(new UserInfo(dataList[i], i + 1));
        }
    }
    
    if (userList.length === 0) {
        throw new Error("没有可用的账号");
    }
}

// 执行签到
async function doCheckin() {
    log("\n========== 开始执行签到任务 ==========\n");
    
    for (let user of userList) {
        notifyMsg = [];
        notifyTitle = "";
        
        try {
            log(`\n---------- 账号${user.index}: ${user.userName} ----------`);
            
            // 获取用户状态
            const userStatus = await user.getUserStatus();
            
            if (user.ckStatus && userStatus) {
                log(`[${user.userName}]查询用户状态成功`);
                
                if (userStatus.hasCheckinToday) {
                    notifyTitle = "今日已签到";
                    doubleLog(`✅ 「${userStatus.nickname}」今日已签到`);
                    doubleLog(`📅 累计签到: ${userStatus.accumulateCheckDayNum}天`);
                    doubleLog(`🔥 连续签到: ${userStatus.continueCheckDayNum}天`);
                } else {
                    log(`[${user.userName}]开始执行签到...`);
                    const checkinResult = await user.checkin();
                    
                    if (checkinResult && checkinResult.success) {
                        notifyTitle = checkinResult.msg || "签到成功";
                        doubleLog(`✅ 「${userStatus.nickname}」签到成功`);
                        doubleLog(`🎁 获得积分: ${checkinResult.point || 0}`);
                        doubleLog(`📅 累计签到: ${userStatus.accumulateCheckDayNum + 1}天`);
                        doubleLog(`🔥 连续签到: ${userStatus.continueCheckDayNum + 1}天`);
                    } else {
                        notifyTitle = "签到失败";
                        const failReason = checkinResult?.msg || "未知原因";
                        doubleLog(`❌ 「${userStatus.nickname}」签到失败`);
                        doubleLog(`📋 失败原因: ${failReason}`);
                        if (checkinResult?.code) {
                            doubleLog(`🔢 错误代码: ${checkinResult.code}`);
                        }
                        // 如果是Token失效，给出明确提示
                        if (failReason.includes('Token') || failReason.includes('失效') || failReason.includes('认证')) {
                            doubleLog(`💡 解决方案: 重新打开小程序更新Token`);
                        }
                    }
                }
            } else {
                const errorMsg = user.lastError || "Token失效或网络错误";
                doubleLog(`⛔️ 「${user.userName}」Token验证失败`);
                doubleLog(`📋 错误信息: ${errorMsg}`);
                doubleLog(`💡 提示: 请重新打开小程序更新Token`);
            }
            
            // 发送通知
            if (notifyMsg.length > 0) {
                showMsg(scriptName, notifyTitle, notifyMsg.join("\n"));
            }
            
        } catch (e) {
            log(`[${user.userName}]执行失败: ${e.message}`);
            showMsg(scriptName, `❌ ${user.userName}执行失败`, e.message || String(e));
        }
    }
    
    log("\n========== 签到任务执行完成 ==========\n");
}

// ============ 主程序入口 ============
(async () => {
    try {
        if (typeof $request !== "undefined") {
            // 抓包模式
            log("[信息]运行模式: 抓包保存Token");
            await getCookie();
        } else {
            // 定时任务模式
            log("[信息]运行模式: 定时签到");
            await loadUsers();
            await doCheckin();
        }
    } catch (e) {
        log(`[错误]脚本运行失败: ${e.message}`);
        showMsg(scriptName, "⛔️ 脚本运行错误", e.message || String(e));
    } finally {
        done();
    }
})();

/** ---------------------------------固定不动区域----------------------------------------- */
//prettier-ignore
async function sendMsg(a) { a && ($.isNode() ? await notify.sendNotify($.name, a) : $.msg($.name, $.title || "", a, { "media-url": $.avatar })) }
function DoubleLog(o) { o && ($.log(`${o}`), $.notifyMsg.push(`${o}`)) };
async function checkEnv() { try { if (!userCookie?.length) throw new Error("no available accounts found"); $.log(`\n[INFO]检测到 ${userCookie?.length ?? 0} 个账号\n`), $.userList.push(...userCookie.map((o => new UserInfo(o))).filter(Boolean)) } catch (o) { throw o } }
function debug(g, e = "debug") { "true" === $.is_debug && ($.log(`\n-----------${e}------------\n`), $.log("string" == typeof g ? g : $.toStr(g) || `debug error => t=${g}`), $.log(`\n-----------${e}------------\n`)) }
//From xream's ObjectKeys2LowerCase
function ObjectKeys2LowerCase(obj) { return !obj ? {} : Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])) };
//From sliverkiss's Request
async function Request(t) { "string" == typeof t && (t = { url: t }); try { if (!t?.url) throw new Error("[URL][ERROR]缺少 url 参数"); let { url: o, type: e, headers: r = {}, body: s, params: a, dataType: n = "form", resultType: u = "data" } = t; const p = e ? e?.toLowerCase() : "body" in t ? "post" : "get", c = o.concat("post" === p ? "?" + $.queryStr(a) : ""), i = t.timeout ? $.isSurge() ? t.timeout / 1e3 : t.timeout : 1e4; "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8"); const y = s && "form" == n ? $.queryStr(s) : $.toStr(s), l = { ...t, ...t?.opts ? t.opts : {}, url: c, headers: r, ..."post" === p && { body: y }, ..."get" === p && a && { params: a }, timeout: i }, m = $.http[p.toLowerCase()](l).then((t => "data" == u ? $.toObj(t.body) || t.body : $.toObj(t) || t)).catch((t => $.log(`[${p.toUpperCase()}][ERROR]${t}\n`))); return Promise.race([new Promise(((t, o) => setTimeout((() => o("当前请求已超时")), i))), m]) } catch (t) { console.log(`[${p.toUpperCase()}][ERROR]${t}\n`) } }
//From chavyleung's Env.js
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, r) => { s.call(this, t, ((t, s, a) => { t ? r(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, r) => e(r))) })) } runScript(t, e) { return new Promise((s => { let r = this.getdata("@chavy_boxjs_userCfgs.httpapi"); r = r ? r.replace(/\n/g, "").trim() : r; let a = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); a = a ? 1 * a : 20, a = e && e.timeout ? e.timeout : a; const [i, o] = r.split("@"), n = { url: `http://${o}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: a }, headers: { "X-Key": i, Accept: "*/*" }, timeout: a }; this.post(n, ((t, e, r) => s(r))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e); if (!s && !r) return {}; { const r = s ? t : e; try { return JSON.parse(this.fs.readFileSync(r)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), r = !s && this.fs.existsSync(e), a = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, a) : r ? this.fs.writeFileSync(e, a) : this.fs.writeFileSync(t, a) } } lodash_get(t, e, s = void 0) { const r = e.replace(/\[(\d+)\]/g, ".$1").split("."); let a = t; for (const t of r) if (a = Object(a)[t], void 0 === a) return s; return a } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, r) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[r + 1]) >> 0 == +e[r + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, r] = /^@(.*?)\.(.*?)$/.exec(t), a = s ? this.getval(s) : ""; if (a) try { const t = JSON.parse(a); e = t ? this.lodash_get(t, r, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, r, a] = /^@(.*?)\.(.*?)$/.exec(e), i = this.getval(r), o = r ? "null" === i ? null : i || "{}" : "{}"; try { const e = JSON.parse(o); this.lodash_set(e, a, t), s = this.setval(JSON.stringify(e), r) } catch (e) { const i = {}; this.lodash_set(i, a, t), s = this.setval(JSON.stringify(i), r) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: r, statusCode: a, headers: i, rawBody: o } = t, n = s.decode(o, this.encoding); e(null, { status: r, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: r, response: a } = t; e(r, a, a && s.decode(a.rawBody, this.encoding)) })) } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, r) => { !t && s && (s.body = r, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, r) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: r, headers: a, body: i, bodyBytes: o } = t; e(null, { status: s, statusCode: r, headers: a, body: i, bodyBytes: o }, i, o) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let r = require("iconv-lite"); this.initGotEnv(t); const { url: a, ...i } = t; this.got[s](a, i).then((t => { const { statusCode: s, statusCode: a, headers: i, rawBody: o } = t, n = r.decode(o, this.encoding); e(null, { status: s, statusCode: a, headers: i, rawBody: o, body: n }, n) }), (t => { const { message: s, response: a } = t; e(s, a, a && r.decode(a.rawBody, this.encoding)) })) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let r = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in r) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? r[e] : ("00" + r[e]).substr(("" + r[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let r = t[s]; null != r && "" !== r && ("object" == typeof r && (r = JSON.stringify(r)), e += `${s}=${r}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", r = "", a) { const i = t => { switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: return { url: t.url || t.openUrl || t["open-url"] }; case "Loon": return { openUrl: t.openUrl || t.url || t["open-url"], mediaUrl: t.mediaUrl || t["media-url"] }; case "Quantumult X": return { "open-url": t["open-url"] || t.url || t.openUrl, "media-url": t["media-url"] || t.mediaUrl, "update-pasteboard": t["update-pasteboard"] || t.updatePasteboard }; case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, r, i(a)); break; case "Quantumult X": $notify(e, s, r, i(a)); case "Node.js": }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), r && t.push(r), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, t.stack) } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
