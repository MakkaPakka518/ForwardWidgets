WidgetMetadata = {
  id: "variety.trakt.final",
  title: "国产综艺时刻表",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "利用 Trakt 精准获取今日更新的国产综艺",
  version: "1.1.4",
  requiredVersion: "0.0.1",
  site: "https://trakt.tv",
  
    // 1. 全局参数 (仅剩 Trakt ID，选填)
    globalParams: [
        {
            name: "clientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "默认使用公共 Key，如遇加载失败建议自行填入。",
            value: ""
        }
    ],

    modules: [
        {
            title: "综艺更新",
            functionName: "loadTraktVariety",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "mode",
                    title: "查看时间",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "今日更新 (Today)", value: "today" },
                        { title: "明日预告 (Tomorrow)", value: "tomorrow" },
                        { title: "未来 7 天 (Next 7 Days)", value: "week" }
                    ]
                }
            ]
        }
    ]
};

// 默认 Trakt Key
const DEFAULT_CLIENT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadTraktVariety(params = {}) {
    const { mode = "today" } = params;
    const clientId = params.clientId || DEFAULT_CLIENT_ID;

    const dateStr = getBeijingDate(mode);
    const days = mode === "week" ? 7 : 1;

    console.log(`[Trakt] Fetching: ${dateStr}`);
    
    const traktUrl = `https://api.trakt.tv/calendars/all/shows/${dateStr}/${days}?countries=cn&genres=reality,game-show,talk-show`;

    try {
        const res = await Widget.http.get(traktUrl, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });

        const data = res.data || [];
        if (!Array.isArray(data) || data.length === 0) {
            return [{ id: "empty", type: "text", title: "暂无综艺更新", subTitle: `${dateStr} 无国产综艺排期` }];
        }

        const promises = data.map(async (item) => {
            const show = item.show;
            const episode = item.episode;

            if (!show.ids || !show.ids.tmdb) return null;
            const tmdbId = show.ids.tmdb;
            const airTime = item.first_aired.split("T")[0]; // 2024-05-24

            // 初始对象 (兜底)
            let resultItem = {
                id: String(tmdbId),
                type: "tmdb",
                tmdbId: parseInt(tmdbId),
                mediaType: "tv",
                title: show.title,
                genreTitle: airTime, 
                subTitle: `S${episode.season}E${episode.number}`,
                year: (show.year || "").toString(),
                posterPath: "",
                backdropPath: ""
            };

            // TMDB 增强 (免 Key)
            try {
                const tmdbRes = await Widget.tmdb.get(`/tv/${tmdbId}`, {
                    params: { language: "zh-CN" }
                });
                
                const d = tmdbRes; // Widget.tmdb.get 直接返回 data 对象
                if (d) {
                    if (d.name) resultItem.title = d.name;
                    if (d.poster_path) resultItem.posterPath = `https://image.tmdb.org/t/p/w500${d.poster_path}`;
                    if (d.backdrop_path) resultItem.backdropPath = `https://image.tmdb.org/t/p/w780${d.backdrop_path}`;
                    
                    // 构造类型标签
                    const genres = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");
                    
                    // 【核心 UI】年份 • 类型
                    resultItem.genreTitle = [airTime, genres].filter(Boolean).join(" • ");
                    
                    // 构造副标题：S5E3 · 歌手踢馆
                    const epTitle = episode.title && !episode.title.match(/^Episode \d+$/) 
                        ? episode.title : `第 ${episode.number} 期`;
                    resultItem.subTitle = `S${episode.season}E${episode.number} · ${epTitle}`;
                    
                    // 评分放在简介
                    resultItem.description = d.overview || (d.vote_average ? `TMDB 评分: ${d.vote_average.toFixed(1)}` : "暂无简介");
                }
            } catch (e) {}

            return resultItem;
        });

        return (await Promise.all(promises)).filter(Boolean);

    } catch (e) {
        return [{ id: "err_net", type: "text", title: "网络错误", subTitle: e.message }];
    }
}

function getBeijingDate(mode) {
    const d = new Date();
    // UTC+8 转换
    const utc8 = d.getTime() + (d.getTimezoneOffset() * 60000) + (3600000 * 8);
    const cnDate = new Date(utc8);

    if (mode === "tomorrow") cnDate.setDate(cnDate.getDate() + 1);

    const y = cnDate.getFullYear();
    const m = String(cnDate.getMonth() + 1).padStart(2, '0');
    const day = String(cnDate.getDate()).padStart(2, '0');
    
    return `${y}-${m}-${day}`;
}
