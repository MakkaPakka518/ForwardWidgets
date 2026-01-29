WidgetMetadata = {
    id: "global_tv_calendar_smart",
    title: "全球追剧时刻表 (双擎版)",
    author: "MakkaPakka",
    description: "聚合全球剧集/综艺。Trakt精准数据 + TMDB智能兜底，内置公用Key。",
    version: "3.0.0",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    // 1. 全局参数
    globalParams: [
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填，填写后更新时间更准确)",
            type: "input",
            description: "不填则使用内置公用 ID (推荐)。",
            value: ""
        }
    ],

    modules: [
        {
            title: "追剧日历 (Drama)",
            functionName: "loadTvCalendar",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "mode",
                    title: "时间范围",
                    type: "enumeration",
                    value: "update_today",
                    enumOptions: [
                        { title: "今日更新", value: "update_today" },
                        { title: "明日首播", value: "premiere_tomorrow" },
                        { title: "7天内首播", value: "premiere_week" },
                        { title: "30天内首播", value: "premiere_month" }
                    ]
                },
                {
                    name: "region",
                    title: "地区偏好",
                    type: "enumeration",
                    value: "Global",
                    enumOptions: [
                        { title: "全球聚合", value: "Global" },
                        { title: "美国 (US)", value: "US" },
                        { title: "日本 (JP)", value: "JP" },
                        { title: "韩国 (KR)", value: "KR" },
                        { title: "中国 (CN)", value: "CN" },
                        { title: "英国 (GB)", value: "GB" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        },
        {
            title: "综艺时刻 (Variety)",
            functionName: "loadVarietyCalendar",
            type: "list",
            cacheDuration: 3600,
            params: [
                {
                    name: "region",
                    title: "综艺地区",
                    type: "enumeration",
                    value: "cn",
                    enumOptions: [
                        { title: "🇨🇳 国产综艺", value: "cn" },
                        { title: "🇰🇷 韩国综艺", value: "kr" },
                        { title: "🇺🇸 欧美综艺", value: "us" },
                        { title: "🇯🇵 日本综艺", value: "jp" },
                        { title: "🌍 全球热门", value: "global" }
                    ]
                },
                {
                    name: "mode",
                    title: "时间范围",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "今日更新 (Trakt优先)", value: "today" },
                        { title: "明日预告 (Trakt优先)", value: "tomorrow" },
                        { title: "近期热播 (TMDB源)", value: "trending" }
                    ]
                }
            ]
        }
    ]
};

// =========================================================================
// 0. 通用配置
// =========================================================================

// Kodi 社区公用 Key，稳定性极高
const DEFAULT_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "战争政治", 37: "西部"
};

function getGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "";
    return ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(" / ");
}

function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    return {
        id: String(id),
        tmdbId: parseInt(tmdbId),
        type: "tmdb",
        mediaType: type,
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "), 
        subTitle: subTitle,
        posterPath: poster ? `https://image.tmdb.org/t/p/w500${poster}` : "",
        backdropPath: backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "",
        description: desc || "暂无简介",
        rating: rating,
        year: year
    };
}

// =========================================================================
// 1. 综艺时刻 (Variety) - 智能双擎
// =========================================================================

async function loadVarietyCalendar(params = {}) {
    const { region = "cn", mode = "today", traktClientId } = params;
    
    // 智能 Key 选择：用户填了就用用户的，没填就用内置的
    const clientId = traktClientId && traktClientId.length > 50 ? traktClientId : DEFAULT_TRAKT_ID;

    // A. 强制热播模式 (直接走 TMDB)
    if (mode === "trending") {
        return await fetchTmdbVariety(region, null); 
    }

    // B. Trakt 优先模式
    const dateStr = getSafeDate(mode); 
    const countryParam = region === "global" ? "" : region; 
    
    // 综艺类型：Reality, Game Show, Talk Show
    const traktUrl = `https://api.trakt.tv/calendars/all/shows/${dateStr}/1?genres=reality,game-show,talk-show${countryParam ? `&countries=${countryParam}` : ''}`;

    try {
        console.log(`[Trakt] Fetching: ${traktUrl} (Key: ${clientId.substring(0,5)}...)`);
        
        const res = await Widget.http.get(traktUrl, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });
        const data = res.data || [];

        // 如果 Trakt 有数据，直接使用
        if (Array.isArray(data) && data.length > 0) {
            const promises = data.map(async (item) => {
                if (!item.show.ids.tmdb) return null;
                return await fetchTmdbDetail(item.show.ids.tmdb, item);
            });
            return (await Promise.all(promises)).filter(Boolean);
        }
    } catch (e) {
        console.log("[Trakt] Failed, switching to TMDB...");
    }

    // C. 兜底模式 (Trakt 无数据/失败时，走 TMDB 精准日期)
    return await fetchTmdbVariety(region, dateStr);
}

// TMDB 综艺获取
async function fetchTmdbVariety(region, dateStr) {
    const queryParams = {
        language: "zh-CN",
        sort_by: "popularity.desc", 
        page: 1,
        with_genres: "10764|10767", // Reality | Talk
        include_null_first_air_dates: false,
        timezone: "Asia/Shanghai" 
    };

    if (region !== "global") {
        queryParams.with_origin_country = region.toUpperCase();
    }

    if (dateStr) {
        // 如果指定了日期，尝试筛选 air_date
        // 注意：TMDB Discover 对单集 air_date 筛选支持有限，这里作为尽力而为的兜底
        queryParams["air_date.gte"] = dateStr;
        queryParams["air_date.lte"] = dateStr;
    } else {
        queryParams.sort_by = "first_air_date.desc";
    }

    try {
        const res = await Widget.tmdb.get("/discover/tv", { params: queryParams });
        const data = res || {};
        
        if (!data.results || data.results.length === 0) {
            return [{ id: "empty", type: "text", title: "暂无综艺更新", subTitle: dateStr ? `${dateStr} 无数据` : "暂无数据" }];
        }

        return data.results.map(item => {
            const year = (item.first_air_date || "").substring(0, 4);
            const genreText = getGenreText(item.genre_ids);
            
            // 构造日期标签
            let dateLabel = "近期热播";
            if (dateStr) dateLabel = `📅 更新: ${dateStr}`;

            return buildItem({
                id: item.id, tmdbId: item.id, type: "tv",
                title: item.name, 
                year: year, 
                poster: item.poster_path, 
                backdrop: item.backdrop_path,
                rating: item.vote_average?.toFixed(1),
                genreText: genreText,
                subTitle: dateLabel, 
                desc: item.overview
            });
        });

    } catch (e) { return [{ id: "err", type: "text", title: "TMDB 错误" }]; }
}

// Trakt 详情转 TMDB
async function fetchTmdbDetail(tmdbId, traktItem) {
    try {
        const d = await Widget.tmdb.get(`/tv/${tmdbId}`, { params: { language: "zh-CN" } });
        if (!d) return null;

        const ep = traktItem.episode;
        const airTime = traktItem.first_aired.split("T")[0];
        const genreText = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");

        return buildItem({
            id: d.id, tmdbId: d.id, type: "tv",
            title: d.name || traktItem.show.title,
            year: (d.first_air_date || "").substring(0, 4),
            poster: d.poster_path, backdrop: d.backdrop_path,
            rating: d.vote_average?.toFixed(1),
            genreText: genreText,
            subTitle: `S${ep.season}E${ep.number} · ${ep.title || "更新"}`, // Trakt 精准单集
            desc: d.overview
        });
    } catch (e) { return null; }
}

// =========================================================================
// 2. 业务逻辑：追剧日历 (Drama)
// =========================================================================

async function loadTvCalendar(params = {}) {
    const { mode = "update_today", region = "Global", page = 1 } = params;
    const dates = calculateDates(mode);
    const isPremiere = mode.includes("premiere");
    
    const queryParams = {
        language: "zh-CN",
        sort_by: "popularity.desc",
        include_null_first_air_dates: false,
        page: page,
        timezone: "Asia/Shanghai"
    };

    const dateField = isPremiere ? "first_air_date" : "air_date";
    queryParams[`${dateField}.gte`] = dates.start;
    queryParams[`${dateField}.lte`] = dates.end;

    if (region !== "Global") {
        queryParams.with_origin_country = region;
        const langMap = { "JP": "ja", "KR": "ko", "CN": "zh", "GB": "en", "US": "en" };
        if (langMap[region]) queryParams.with_original_language = langMap[region];
    }

    try {
        const res = await Widget.tmdb.get("/discover/tv", { params: queryParams });
        const data = res || {};

        if (!data.results || data.results.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "暂无更新", subTitle: `${region} 在 ${dates.start} 无数据` }] : [];

        return data.results.map(item => {
            const dateStr = item[dateField] || "";
            const shortDate = dateStr.slice(5); 
            const year = (item.first_air_date || "").substring(0, 4);
            const genreText = getGenreText(item.genre_ids);
            
            let subInfo = [];
            if (mode !== "update_today" && shortDate) subInfo.push(`📅 ${shortDate}`);
            else if (mode === "update_today") subInfo.push("🆕 今日");
            if (item.original_name && item.original_name !== item.name) subInfo.push(item.original_name);

            return buildItem({
                id: item.id, tmdbId: item.id, type: "tv",
                title: item.name,
                year: year, poster: item.poster_path, backdrop: item.backdrop_path,
                rating: item.vote_average?.toFixed(1),
                genreText: genreText,
                subTitle: subInfo.join(" | "),
                desc: item.overview
            });
        });
    } catch (e) { return [{ id: "err", type: "text", title: "网络错误" }]; }
}

function calculateDates(mode) {
    const today = new Date();
    const toStr = (d) => d.toISOString().split('T')[0];
    if (mode === "update_today") return { start: toStr(today), end: toStr(today) };
    if (mode === "premiere_tomorrow") {
        const tmr = new Date(today); tmr.setDate(today.getDate() + 1); return { start: toStr(tmr), end: toStr(tmr) };
    }
    if (mode === "premiere_week") {
        const start = new Date(today); start.setDate(today.getDate() + 1);
        const end = new Date(today); end.setDate(today.getDate() + 7);
        return { start: toStr(start), end: toStr(end) };
    }
    if (mode === "premiere_month") {
        const start = new Date(today); start.setDate(today.getDate() + 1);
        const end = new Date(today); end.setDate(today.getDate() + 30);
        return { start: toStr(start), end: toStr(end) };
    }
    return { start: toStr(today), end: toStr(today) };
}

function getSafeDate(mode) {
    const d = new Date();
    if (mode === "tomorrow") d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}
