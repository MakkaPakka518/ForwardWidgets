// =========================================================================
// 1. 插件元数据 (WidgetMetadata)
// =========================================================================

WidgetMetadata = {
    id: "global_tvultimate",
    title: "刻表",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "聚合全周更表。",
    version: "2.1.2",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",
    
    // 全局参数
    globalParams: [
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "综艺模块专用，不填则使用内置默认 ID。",
            value: ""
        }
    ],

    modules: [
        {
            title: "追剧日历 (Drama)",
            functionName: "loadTvCalendar",
            type: "video",
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
            type: "video",
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
        },
        {
            title: "动漫周更 (Anime)",
            functionName: "loadBangumiCalendar",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "weekday",
                    title: "选择日期",
                    type: "enumeration",
                    value: "today",
                    enumOptions: [
                        { title: "📅 今天", value: "today" },
                        { title: "周一 (月)", value: "1" },
                        { title: "周二 (火)", value: "2" },
                        { title: "周三 (水)", value: "3" },
                        { title: "周四 (木)", value: "4" },
                        { title: "周五 (金)", value: "5" },
                        { title: "周六 (土)", value: "6" },
                        { title: "周日 (日)", value: "7" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// =========================================================================
// 0. 通用工具与字典
// =========================================================================

// 已内置用户指定的 Trakt ID
const DEFAULT_TRAKT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";

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

/**
 * 核心格式化函数 (保留原 buildItem 逻辑)
 */
function buildItem({ id, tmdbId, type, title, year, poster, backdrop, rating, genreText, subTitle, desc }) {
    const fullPoster = poster && poster.startsWith("http") ? poster : (poster ? `https://image.tmdb.org/t/p/w500${poster}` : "");
    const fullBackdrop = backdrop && backdrop.startsWith("http") ? backdrop : (backdrop ? `https://image.tmdb.org/t/p/w780${backdrop}` : "");

    return {
        id: String(id),
        tmdbId: parseInt(tmdbId) || 0,
        type: "tmdb",
        mediaType: type || "tv",
        title: title,
        genreTitle: [year, genreText].filter(Boolean).join(" • "), 
        subTitle: subTitle,
        posterPath: fullPoster,
        backdropPath: fullBackdrop,
        description: desc || "暂无简介",
        rating: rating,
        year: year
    };
}

// =========================================================================
// 1. 业务逻辑：动漫周更 (Anime)
// =========================================================================

async function loadBangumiCalendar(params = {}) {
    const { weekday = "today", page = 1 } = params;
    const pageSize = 20;

    let targetDayId = parseInt(weekday);
    if (weekday === "today") {
        const jsDay = new Date().getDay();
        targetDayId = jsDay === 0 ? 7 : jsDay;
    }
    const dayName = getWeekdayName(targetDayId);

    try {
        const res = await Widget.http.get("https://api.bgm.tv/calendar");
        const data = res.data || [];
        const dayData = data.find(d => d.weekday && d.weekday.id === targetDayId);

        if (!dayData?.items) return [];

        const allItems = dayData.items;
        const start = (page - 1) * pageSize;
        const pageItems = allItems.slice(start, start + pageSize);

        const promises = pageItems.map(async (item) => {
            const title = item.name_cn || item.name;
            const subTitle = item.name;
            const cover = item.images ? (item.images.large || item.images.common) : "";
            
            let itemData = {
                id: `bgm_${item.id}`,
                tmdbId: 0,
                type: "tv",
                title: title,
                year: "",
                poster: cover,
                backdrop: "",
                rating: item.rating?.score?.toFixed(1) || "0.0",
                genreText: "动画",
                subTitle: subTitle,
                desc: item.summary
            };

            const tmdbItem = await searchTmdbBestMatch(title, subTitle);
            if (tmdbItem) {
                itemData.id = String(tmdbItem.id);
                itemData.tmdbId = tmdbItem.id;
                itemData.poster = tmdbItem.poster_path; 
                itemData.backdrop = tmdbItem.backdrop_path;
                itemData.year = (tmdbItem.first_air_date || "").substring(0, 4);
                itemData.genreText = getGenreText(tmdbItem.genre_ids);
                itemData.desc = tmdbItem.overview || itemData.desc;
                itemData.rating = tmdbItem.vote_average?.toFixed(1) || itemData.rating;
            }
            
            const r = buildItem(itemData);
            r.genreTitle = `${dayName} • ${r.genreTitle.split(" • ").pop() || "动画"}`;
            return r;
        });

        return (await Promise.all(promises)).filter(Boolean);
    } catch (e) { return []; }
}

// =========================================================================
// 2. 业务逻辑：追剧日历 (Drama)
// =========================================================================

async function loadTvCalendar(params = {}) {
    const { mode = "update_today", region = "Global", page = 1 } = params;
    const dates = calculateDates(mode);
    const dateField = mode.includes("premiere") ? "first_air_date" : "air_date";
    
    const queryParams = {
        language: "zh-CN",
        sort_by: "popularity.desc",
        page: page,
        [`${dateField}.gte`]: dates.start,
        [`${dateField}.lte`]: dates.end
    };

    if (region !== "Global") queryParams.with_origin_country = region;

    try {
        const res = await Widget.tmdb.get("/discover/tv", { params: queryParams });
        return (res.results || []).map(item => {
            const year = (item.first_air_date || "").substring(0, 4);
            const shortDate = (item[dateField] || "").slice(5);
            return buildItem({
                id: item.id, tmdbId: item.id, type: "tv",
                title: item.name, year: year, poster: item.poster_path, backdrop: item.backdrop_path,
                rating: item.vote_average?.toFixed(1),
                genreText: getGenreText(item.genre_ids),
                subTitle: mode === "update_today" ? "🆕 今日" : `📅 ${shortDate}`,
                desc: item.overview
            });
        });
    } catch (e) { return []; }
}

// =========================================================================
// 3. 业务逻辑：综艺时刻 (Variety) - 增强修复版
// =========================================================================

async function loadVarietyCalendar(params = {}) {
    const { region = "cn", mode = "today", traktClientId } = params;
    const clientId = traktClientId || DEFAULT_TRAKT_ID;

    if (mode === "trending") return await fetchTmdbVariety(region, null); 

    const dateStr = getSafeDate(mode); 
    const countryParam = region === "global" ? "" : region; 
    const traktUrl = `https://api.trakt.tv/calendars/all/shows/${dateStr}/1?genres=reality,game-show,talk-show${countryParam ? `&countries=${countryParam}` : ''}`;

    try {
        const res = await Widget.http.get(traktUrl, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId }
        });
        const items = res.data || [];

        if (Array.isArray(items) && items.length > 0) {
            const promises = items.map(async (item) => {
                if (!item.show?.ids?.tmdb) return null;
                return await fetchTmdbDetail(item.show.ids.tmdb, item);
            });
            const results = (await Promise.all(promises)).filter(Boolean);
            if (results.length > 0) return results;
        }
    } catch (e) {
        console.error("Trakt Request Failed:", e.message);
    }

    // 降级到 TMDB
    return await fetchTmdbVariety(region, dateStr);
}

// =========================================================================
// 4. 辅助工具函数
// =========================================================================

function calculateDates(mode) {
    const d = new Date();
    const toS = (date) => date.toISOString().split('T')[0];
    if (mode === "update_today") return { start: toS(d), end: toS(d) };
    if (mode === "premiere_tomorrow") { d.setDate(d.getDate()+1); return { start: toS(d), end: toS(d) }; }
    if (mode === "premiere_week") {
        const s = new Date(); s.setDate(s.getDate()+1);
        const e = new Date(); e.setDate(e.getDate()+7);
        return { start: toS(s), end: toS(e) };
    }
    const start = new Date(); start.setDate(start.getDate()+1);
    const end = new Date(); end.setDate(end.getDate()+30);
    return { start: toS(start), end: toS(end) };
}

function getSafeDate(mode) {
    const d = new Date();
    if (mode === "tomorrow") d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function getWeekdayName(id) {
    const map = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
    return map[id] || "";
}

async function fetchTmdbVariety(region, dateStr) {
    const q = { language: "zh-CN", sort_by: "popularity.desc", with_genres: "10764|10767", page: 1 };
    if (region !== "global") q.with_origin_country = region.toUpperCase();
    if (dateStr) { q["air_date.gte"] = dateStr; q["air_date.lte"] = dateStr; }
    try {
        const res = await Widget.tmdb.get("/discover/tv", { params: q });
        return (res.results || []).map(item => buildItem({
            id: item.id, tmdbId: item.id, type: "tv",
            title: item.name, year: (item.first_air_date || "").substring(0, 4),
            poster: item.poster_path, backdrop: item.backdrop_path,
            rating: item.vote_average?.toFixed(1),
            genreText: getGenreText(item.genre_ids),
            subTitle: dateStr ? `📅 更新: ${dateStr}` : "近期热播",
            desc: item.overview
        }));
    } catch (e) { return []; }
}

async function fetchTmdbDetail(tmdbId, traktItem) {
    try {
        const d = await Widget.tmdb.get(`/tv/${tmdbId}`, { params: { language: "zh-CN" } });
        if (!d) return null;
        const ep = traktItem.episode || {};
        const genreText = getGenreText(d.genres ? d.genres.map(g=>g.id) : (d.genre_ids || []));
        return buildItem({
            id: d.id, tmdbId: d.id, type: "tv",
            title: d.name || traktItem.show.title,
            year: (d.first_air_date || "").substring(0, 4),
            poster: d.poster_path, backdrop: d.backdrop_path,
            rating: d.vote_average?.toFixed(1), genreText: genreText,
            subTitle: `S${ep.season || 1}E${ep.number || 1} · ${ep.title || "更新"}`,
            desc: d.overview
        });
    } catch (e) { return null; }
}

async function searchTmdbBestMatch(q1, q2) {
    const search = async (q) => {
        if (!q) return null;
        const clean = q.replace(/第[一二三四五六七八九十\d]+[季章]/g, "").trim();
        try {
            const res = await Widget.tmdb.get("/search/tv", { params: { query: clean, language: "zh-CN" } });
            return res.results?.[0];
        } catch (e) { return null; }
    };
    let r = await search(q1);
    if (!r && q2 && q1 !== q2) r = await search(q2);
    return r;
}
