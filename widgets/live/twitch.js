WidgetMetadata = {
    id: "twitch_box_fix",
    title: "Twitch 关注 (修复版)",
    author: "Makkapakka",
    description: "V1.1 修复：解决没有播放按钮/无法跳转的问题。点击卡片将直接跳转 Twitch App 或网页观看。",
    version: "1.1.0",
    requiredVersion: "0.0.1",
    site: "https://www.twitch.tv",

    modules: [
        {
            title: "我的关注",
            functionName: "loadTwitchStreamers",
            type: "list",
            cacheDuration: 60,
            params: [
                {
                    name: "streamers",
                    title: "主播 ID 列表",
                    type: "input",
                    description: "例如: uzi, shroud, tarik (逗号分隔)",
                    value: "shroud, tarik, tenz, seoi1016"
                },
                {
                    name: "mode",
                    title: "打开方式",
                    type: "enumeration",
                    value: "app",
                    enumOptions: [
                        { title: "跳转 Twitch App (推荐)", value: "app" },
                        { title: "内置浏览器", value: "web" }
                    ]
                }
            ]
        }
    ]
};

async function loadTwitchStreamers(params = {}) {
    const { streamers, mode } = params;

    if (!streamers) return [{ id: "tip", type: "text", title: "请填写主播 ID" }];

    const idList = streamers.split(/[,，]/).map(s => s.trim()).filter(Boolean);

    if (idList.length === 0) return [{ id: "empty", type: "text", title: "列表为空" }];

    return idList.map(id => {
        const timestamp = new Date().getTime(); 
        // 封面图
        const posterUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${id}-640x360.jpg?t=${timestamp}`;

        // 构造跳转链接
        let targetUrl = "";
        let subTitle = "";

        if (mode === "web") {
            // 网页模式：使用纯净播放器页面
            targetUrl = `https://player.twitch.tv/?channel=${id}&parent=localhost&muted=false`;
            subTitle = "🌐 浏览器观看";
        } else {
            // App 模式：尝试唤起 Twitch App
            // 如果手机没装 App，通常系统会自动跳转到 App Store 或网页
            targetUrl = `twitch://stream/${id}`; 
            // 备用：如果上面的唤起失败，部分系统可能需要 http 链接来触发通用链接跳转
            // targetUrl = `https://www.twitch.tv/${id}`; 
            subTitle = "📱 App 观看";
        }

        return {
            id: `twitch_${id}`,
            // 关键修改：类型改为 url，这样就是点击跳转逻辑
            type: "url", 
            
            // 这里填写跳转地址
            url: targetUrl, 
            
            // ⚠️ 注意：这里不要填 videoUrl
            // 填了 videoUrl 就会出现你截图里的“播放按钮”然后报错，因为我们没有 m3u8 视频流
            
            title: id.toUpperCase(),
            subTitle: subTitle,
            posterPath: posterUrl,
            description: `频道: ${id}\n点击卡片/封面即可跳转观看直播\n实时画面抓取中...`
        };
    });
}
