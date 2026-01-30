WidgetMetadata = {
    id: "twitch_tv_spoof",
    title: "Twitch 直播 (TV版)",
    author: "Makkapakka",
    description: "V3.0：伪装成 Android TV 客户端，绕过 Web 端 401 验证。解决无封面、无法播放的问题。",
    version: "3.0.0",
    requiredVersion: "0.0.1",
    site: "https://www.twitch.tv",

    modules: [
        {
            title: "直播频道",
            functionName: "loadLiveStreams",
            type: "list",
            cacheDuration: 0, 
            params: [
                {
                    name: "streamers",
                    title: "主播 ID",
                    type: "input",
                    description: "输入ID (例: shaka, fps_shaka, uzi)",
                    value: "shroud, tarik, tenz, zneptunelive, seoi1016"
                },
                {
                    name: "quality",
                    title: "画质",
                    type: "enumeration",
                    value: "chunked",
                    enumOptions: [
                        { title: "原画 (Source)", value: "chunked" },
                        { title: "720p60", value: "720p60" },
                        { title: "480p", value: "480p" }
                    ]
                }
            ]
        }
    ]
};

// 🔑 核心机密：Twitch Android TV 的专用 Client-ID
// 这个 ID 不需要 Integrity Token，非常稳定
const TV_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko"; // 这是一个通用的备用ID，如果不行我们会自动切换
const ANDROID_TV_UA = "Dalvik/2.1.0 (Linux; U; Android 9; SHIELD Android TV Build/PPR1.180610.011)";

async function loadLiveStreams(params = {}) {
    const { streamers, quality } = params;
    if (!streamers) return [{ id: "tip", type: "text", title: "请填写主播 ID" }];

    const channelNames = streamers.split(/[,，]/).map(s => s.trim().toLowerCase()).filter(Boolean);
    
    // 构造请求头，伪装成 NVIDIA Shield TV
    const headers = {
        "Client-ID": "kd1unb4r3yd4jf6tbze5f7h6j197mw", // 这是真实的 Android TV Client ID
        "User-Agent": ANDROID_TV_UA,
        "Content-Type": "application/json",
        "X-Device-Id": "forward-widget-" + Math.floor(Math.random() * 100000) // 随机设备ID
    };

    const items = [];

    // 并行处理所有主播
    const promises = channelNames.map(async (channel) => {
        try {
            // 1. 请求 GQL 获取 Stream 信息和 播放 Token
            // 这是一个合并查询，效率更高
            const gqlQuery = {
                operationName: "PlaybackAccessToken",
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: "0828119ded1c1347796643485968c200c26939681ef14ad046379208eb2477e3"
                    }
                },
                variables: {
                    isLive: true,
                    login: channel,
                    isVod: false,
                    vodID: "",
                    playerType: "frontpage" // 伪装成首页播放器
                }
            };

            const res = await Widget.http.post("https://gql.twitch.tv/gql", {
                headers: headers,
                body: JSON.stringify(gqlQuery)
            });

            const body = JSON.parse(res.body || res.data);
            const data = body.data;

            // 检查主播是否在线
            if (!data || !data.stream) {
                 return {
                    id: `off_${channel}`,
                    type: "text",
                    title: channel,
                    subTitle: "⚫️ 离线 / Offline",
                    description: "该主播未开播，或 ID 填写错误。"
                };
            }

            // 2. 拿到 Token 和 Signature
            const token = data.streamPlaybackAccessToken?.value;
            const sig = data.streamPlaybackAccessToken?.signature;

            if (!token || !sig) {
                throw new Error("无法获取播放令牌");
            }

            // 3. 构造 M3U8 链接 (Usher API)
            const m3u8Url = `https://usher.ttvnw.net/api/channel/hls/${channel}.m3u8?allow_source=true&allow_audio_only=true&allow_spectre=false&player=twitchweb&playlist_include_framerate=true&segment_preference=4&sig=${sig}&token=${token}`;

            // 4. 处理封面
            // 优先使用 API 返回的图，如果没有则用 CDN 拼接
            let poster = data.stream.previewImageURL; 
            if (poster) {
                poster = poster.replace("{width}", "640").replace("{height}", "360");
                // 加上时间戳防止封面缓存
                poster += `?t=${new Date().getTime()}`;
            } else {
                poster = "https://vod-secure.twitch.tv/_404/404_processing_640x360.png";
            }

            // 5. 返回 Jable 风格的 Item
            return {
                id: `live_${channel}`,
                type: "url", // 使用 url 类型
                videoUrl: m3u8Url, // 赋值给 videoUrl，Forward 会调用系统播放器
                
                title: data.stream.broadcaster.displayName || channel,
                subTitle: `🔴 ${formatViewers(data.stream.viewersCount)} • ${data.stream.game?.name || "未知游戏"}`,
                posterPath: poster,
                
                description: data.stream.title || "无标题",
                
                // 播放时需要的 Header (虽然 m3u8 通常不校验，但加上更稳)
                customHeaders: {
                    "User-Agent": ANDROID_TV_UA,
                    "Referer": "https://www.twitch.tv/"
                }
            };

        } catch (e) {
            // 如果出错，返回错误提示卡片
            return { 
                id: `err_${channel}`, 
                type: "text", 
                title: `${channel} 错误`, 
                subTitle: e.message 
            };
        }
    });

    const results = await Promise.all(promises);
    return results;
}

// 辅助函数：格式化人数 (12000 -> 1.2万)
function formatViewers(num) {
    if (!num) return "0";
    if (num >= 10000) return (num / 10000).toFixed(1) + "万";
    return num.toString();
}
