/*
------------------------------------------
@Description: GBXYC签到脚本
@Date: 2025.11.05
------------------------------------------
[Script]
http-response ^https:\/\/api\.alldragon\.com\/msite\/member\/getMemberInfo\.json script-path=checkin.js, requires-body=true, timeout=60, tag=小程序获取Cookie

[MITM]
hostname = api.alldragon.com
*/

const $ = new Env("GBXYC签到脚本");
const ckName = "checkin_data";
let userCookie = $.getjson(ckName, []);

// 配置
$.userIdx = 0;
$.userList = [];
$.notifyMsg = [];
const notify = $.isNode() ? require('./sendNotify') : '';
const isDebug = ($.isNode() ? process.env.IS_DEDUG : $.getdata('is_debug')) === 'true';

//------------------------------------------
// 主函数
async function main() {
    for (let user of $.userList) {
        $.notifyMsg = [];
        try {
            $.log(`[${user.userName}] 开始执行签到\n`);
            
            // 查询用户信息
            let userInfo = await user.getMemberInfo();
            if (userInfo) {
                addMsg(`👤 ${userInfo.nick_name} | 🏆 ${userInfo.grade_code}`);
                addMsg(`💎 可用积分：${userInfo.ava_point}`);
            }
            
            // 执行签到
            let result = await user.checkin();
            if (user.ckStatus) {
                if (result?.awardList?.length > 0) {
                    const award = result.awardList[0];
                    addMsg(`✅ 签到成功！${award.award_desc}`);
                    addMsg(`📊 连续签到：${result.consecutive ? '是' : '否'}`);
                    
                    // 查询最新积分
                    let updated = await user.getMemberInfo();
                    if (updated) addMsg(`💰 当前积分：${updated.ava_point}`);
                } else if (result?.message) {
                    addMsg(`ℹ️ ${result.message}`);
                }
            } else {
                addMsg(`⛔️ Cookie 失效，请重新获取`);
            }
            
            await sendMsg($.notifyMsg.join('\n'));
        } catch (e) {
            $.log(`[${user.userName}] 错误: ${e}\n`);
        }
    }
}

// 用户类
class UserInfo {
    constructor(user) {
        this.index = ++$.userIdx;
        this.authorization = user.authorization;
        this.memberId = user.memberId;
        this.userName = user.userName || `用户${this.index}`;
        this.ckStatus = true;
        this.baseUrl = 'https://api.alldragon.com';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.64(0x18004030) NetType/WIFI Language/zh_HK',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': this.authorization,
            'Accept-Encoding': 'gzip,compress,br,deflate',
            'Connection': 'keep-alive',
            'Referer': 'https://servicewechat.com/wxef49bf6a5aaef56a/70/page-frame.html',
            'Host': 'api.alldragon.com'
        };
    }
    
    async request(opts) {
        try {
            const url = opts.url.startsWith('http') ? opts.url : this.baseUrl + opts.url;
            const res = await httpRequest({ ...opts, url, headers: opts.headers || this.headers });
            if (isDebug) $.log(`[DEBUG] ${opts.url}: ${JSON.stringify(res)}\n`);
            return res;
        } catch (e) {
            this.ckStatus = false;
            $.log(`[${this.userName}] 请求失败: ${e}\n`);
            return null;
        }
    }
    
    async getMemberInfo() {
        try {
            const res = await this.request({
                url: '/msite/member/getMemberInfo.json?needPoint=1&tenantId=4200&tenantCode=xycxmall&clientType=3',
                method: 'GET'
            });
            return res?.code === 200 ? res.data : null;
        } catch (e) {
            $.log(`[${this.userName}] 获取用户信息失败: ${e}\n`);
            return null;
        }
    }
    
    async checkin() {
        try {
            const res = await this.request({
                url: '/mkt2/checkin/checkin.json',
                method: 'POST',
                body: 'tenantId=4200&tenantCode=xycxmall&clientType=3',
                headers: { ...this.headers, 'Content-Length': '46' }
            });
            
            if (!res) return null;
            
            if (res.code === 200) {
                $.log(`[${this.userName}] 签到成功\n`);
                return res.data;
            } else if (res.code === 1004) {
                this.ckStatus = false;
                $.log(`[${this.userName}] ${res.msg}\n`);
                return null;
            } else {
                $.log(`[${this.userName}] ${res.msg}\n`);
                return { message: res.msg };
            }
        } catch (e) {
            this.ckStatus = false;
            $.log(`[${this.userName}] 签到异常: ${e}\n`);
            return null;
        }
    }
}

// 获取 Cookie
async function getCookie() {
    try {
        if ($request?.method === 'OPTIONS') return;
        
        const headers = objectKeys2Lower($request.headers);
        const authorization = headers.authorization;
        if (!authorization) throw new Error("获取 Authorization 失败");
        
        // 解析响应体
        let data = {};
        try {
            const body = JSON.parse($response.body);
            if (body?.success && body?.data) {
                data = {
                    memberId: body.data.member_id,
                    userName: body.data.nick_name || '未知用户',
                    mobile: body.data.mobile,
                    gradeCode: body.data.grade_code,
                    avaPoint: body.data.ava_point
                };
            }
        } catch (e) {
            $.log(`解析响应失败，使用 JWT\n`);
            const payload = JSON.parse(atob(authorization.split('.')[1]));
            data = {
                memberId: payload.memberId,
                userName: `用户${payload.mobile?.substr(-4) || ''}`,
                mobile: payload.mobile
            };
        }
        
        if (!data.memberId) throw new Error("无法获取会员ID");
        
        const newData = {
            memberId: data.memberId,
            authorization,
            userName: data.userName,
            mobile: data.mobile,
            updateTime: new Date().toLocaleString('zh-CN')
        };
        
        const index = userCookie.findIndex(e => e.memberId === newData.memberId);
        const isUpdate = index !== -1;
        
        if (isUpdate) {
            userCookie[index] = newData;
        } else {
            userCookie.push(newData);
        }
        
        $.setjson(userCookie, ckName);
        
        const msg = [
            `👤 ${data.userName}`,
            `📱 ${data.mobile}`,
            `🆔 ${data.memberId}`,
            data.gradeCode ? `🏆 ${data.gradeCode}` : '',
            data.avaPoint ? `💎 ${data.avaPoint}分` : '',
            `⏰ ${newData.updateTime}`
        ].filter(Boolean).join('\n');
        
        $.msg($.name, isUpdate ? '🔄 Cookie 更新成功' : '🎉 Cookie 获取成功', msg);
    } catch (e) {
        $.msg($.name, '⛔️ 获取 Cookie 失败', e.message || e);
        throw e;
    }
}

// 主程序入口
!(async () => {
    try {
        if (typeof $request !== "undefined") {
            await getCookie();
        } else {
            if (userCookie.length === 0) throw new Error("未找到 Cookie");
            $.log(`共找到 ${userCookie.length} 个账号\n`);
            userCookie.forEach(user => $.userList.push(new UserInfo(user)));
            await main();
        }
    } catch (e) {
        $.logErr(e);
        $.msg($.name, '⛔️ 脚本运行错误', e.message || e);
    } finally {
        $.done({ ok: 1 });
    }
})();

//========== 工具函数 ==========
function addMsg(msg) {
    if (isDebug) $.log(`[INFO] ${msg}\n`);
    $.notifyMsg.push(msg);
}

async function sendMsg(msg) {
    if (!msg) return;
    if ($.isNode()) {
        await notify.sendNotify($.name, msg);
    } else {
        $.msg($.name, '', msg);
    }
}

function objectKeys2Lower(obj) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
}

async function httpRequest(opts) {
    if ($.isNode()) {
        const axios = require('axios');
        const config = {
            method: opts.method || 'GET',
            url: opts.url,
            headers: opts.headers,
            params: opts.params
        };
        if (opts.body) config.data = opts.body;
        
        const res = await axios(config);
        return res.data;
    } else {
        return new Promise((resolve, reject) => {
            const method = (opts.method || 'GET').toLowerCase();
            $httpClient[method]({
                url: opts.url,
                headers: opts.headers,
                body: opts.body
            }, (err, resp, body) => {
                if (err) {
                    reject(err);
                } else {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(e);
                    }
                }
            });
        });
    }
}

// Env 类
function Env(name) {
    this.name = name;
    this.isNode = () => typeof module !== 'undefined' && !!module.exports;
    this.getdata = key => {
        if (this.isNode()) return process.env[key];
        return $persistentStore.read(key);
    };
    this.setdata = (val, key) => {
        if (this.isNode()) return false;
        return $persistentStore.write(val, key);
    };
    this.getjson = (key, def) => {
        let val = this.getdata(key);
        if (!val) return def;
        try {
            return JSON.parse(val);
        } catch {
            return def;
        }
    };
    this.setjson = (val, key) => this.setdata(JSON.stringify(val), key);
    this.log = msg => console.log(msg);
    this.logErr = err => console.log(err);
    this.msg = (title, subtitle, message) => {
        if (this.isNode()) {
            console.log(`${title}\n${subtitle}\n${message}`);
        } else {
            $notification.post(title, subtitle, message);
        }
    };
    this.done = val => {
        if (this.isNode()) {
            process.exit(0);
        } else {
            $done(val);
        }
    };
}

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
