WidgetMetadata = {
  id: "variety.trakt.final",
  title: "国产综艺时刻表",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "利用 Trakt 精准获取今日更新的国产综艺",
  version: "1.1.4",
  requiredVersion: "0.0.1",
  site: "https://trakt.tv",

    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取数据。",
            value: ""
        }
    ],

    modules: [
        {
            title: "综艺更新",
            functionName: "loadVariety",
            type: "list",
            cacheDuration: 0, // 禁用缓存以便调试
            params: [
                {
                    name: "mode",
                    title: "查看模式",
                    type: "enumeration",
                    value: "auto",
                    enumOptions: [
                        { title: "自动 (当天无数据则推荐热播)", value: "auto" },
                        { title: "强制查询当天 (可能为空)", value: "strict" }
                    ]
                }
            ]
        }
    ]
};

const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadVariety(params = {}) {
    const { mode = "auto", apiKey } = params;
    
    if (!apiKey) {
        return [{ id: "err", type: "text", title: "请填写 TMDB API Key" }];
    }

    // 1. 获取系统日期 (您现在的 2026-01-28)
    const dateStr = getSafeDate(); 
    console.log(`[TimeTravel] User Date: ${dateStr}`);

    // 2. 尝试请求 Trakt (查询 2026 年的排期)
    // 注意：2026年大概率没数据，这是正常的
    const traktUrl = `https://api.trakt.tv/calendars/all/shows/${dateStr}/1?countries=cn&genres=reality,game-show,talk-show`;
    let traktData = [];

    try {
        const res = await Widget.http.get(traktUrl, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": DEFAULT_TRAKT_ID }
        });
        traktData = res.data || [];
    } catch (e) {
        console.log("Trakt request failed, ignoring.");
    }

    // 3. 如果 Trakt 有数据，直接显示 (天选之子！)
    if (traktData.length > 0) {
        const promises = traktData.map(async (item) => {
            if (!item.show.ids.tmdb) return null;
            return await fetchTmdbDetail(item.show.ids.tmdb, item, apiKey);
        });
        return (await Promise.all(promises)).filter(Boolean);
    }

    // 4. 如果没数据 (2026年大概率没数据)
    if (mode === "strict") {
        return [{ id: "empty", type: "text", title: "2026年暂无排期", subTitle: "Trakt 数据库尚未收录该日期的综艺" }];
    }

    // 5. 自动回溯模式 (Auto Fallback)
    // 既然 2026 没数据，我们去 TMDB 拉取 "最新收录" 或 "正在热播" 的综艺
    // sort_by=first_air_date.desc 会返回数据库里最新的综艺 (可能是2024, 2025的)
    return await fetchTmdbLatest(apiKey, dateStr);
}

// ==========================================
// TMDB 智能回溯
// ==========================================

async function fetchTmdbLatest(apiKey, userDate) {
    // 筛选：国产(CN) + 综艺(Reality/Talk) + 按首播日期降序
    // 这样能保证即使用户在2026年，也能看到2024/2025年最新的综艺
    const url = `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&language=zh-CN&sort_by=first_air_date.desc&page=1&with_origin_country=CN&with_genres=10764|10767&include_null_first_air_dates=false`;
    
    try {
        const res = await Widget.http.get(url);
        const data = res.data || {};
        
        if (!data.results || data.results.length === 0) {
            return [{ id: "empty", type: "text", title: "数据库空白", subTitle: "TMDB 也没有数据" }];
        }

        return data.results.map(item => {
            const date = item.first_air_date || item.release_date || "";
            const year = date.substring(0, 4);
            const rating = item.vote_average ? item.vote_average.toFixed(1) : "0.0";
            
            // 构造 UI
            return {
                id: String(item.id),
                tmdbId: item.id,
                type: "tmdb",
                mediaType: "tv",
                
                title: item.name,
                // 副标题提示用户：这是“最新收录”，而非“今日更新”
                subTitle: `最新收录 · ⭐ ${rating}`, 
                genreTitle: `${year} • 综艺`, // 年份 • 类型
                
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
                description: item.overview || "暂无简介"
            };
        });
    } catch (e) {
        return [{ id: "err", type: "text", title: "TMDB 连接失败", subTitle: e.message }];
    }
}

// 辅助：Trakt 详情转换
async function fetchTmdbDetail(tmdbId, traktItem, apiKey) {
    try {
        const url = `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&language=zh-CN`;
        const res = await Widget.http.get(url);
        const d = res.data;
        if (!d) return null;

        const ep = traktItem.episode;
        const airTime = traktItem.first_aired.split("T")[0];
        const genres = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");

        return {
            id: String(d.id),
            tmdbId: d.id,
            type: "tmdb",
            mediaType: "tv",
            title: d.name || traktItem.show.title,
            genreTitle: [airTime, genres].filter(Boolean).join(" • "),
            subTitle: `S${ep.season}E${ep.number} · ${ep.title || "更新"}`,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            description: d.overview
        };
    } catch (e) { return null; }
}

function getSafeDate() {
    const d = new Date();
    // 强制输出 YYYY-MM-DD，不依赖时区计算
    return d.toISOString().split('T')[0];
}
