// 严格遵循 basic-widget.md 定义元数据
WidgetMetadata = {
  id: "tv.calendar.strict",
  title: "全球追剧日历",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  description: "根据TMDB日期生成追剧日历",
  version: "2.2.5",
  requiredVersion: "0.0.1",
  site: "https://www.themoviedb.org",

    // 0. 全局免 Key
    globalParams: [],

    modules: [
        {
            title: "追剧日历",
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
                // 支持分页
                {
                    name: "page",
                    title: "页码",
                    type: "page"
                }
            ]
        }
    ]
};

// TMDB 类型映射
const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "战争政治", 37: "西部"
};

async function loadTvCalendar(params = {}) {
    const { mode = "update_today", region = "Global", page = 1 } = params;

    const dates = calculateDates(mode);
    const isPremiere = mode.includes("premiere");
    
    // 构造请求参数
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
        // 免 Key 请求
        const res = await Widget.tmdb.get("/discover/tv", { params: queryParams });
        const data = res || {};

        if (!data.results || data.results.length === 0) {
            return page === 1 ? [{ id: "empty", type: "text", title: "暂无更新", subTitle: `${region} 在 ${dates.start} 无数据` }] : [];
        }

        return data.results.map(item => {
            const displayName = item.name || item.original_name;
            const originalName = item.original_name || "";
            const dateStr = item[dateField] || "";
            const shortDate = dateStr.slice(5); // 10-25
            const year = (item.first_air_date || "").substring(0, 4);
            const score = item.vote_average ? item.vote_average.toFixed(1) : "0.0";

            // 1. 类型处理
            const genreText = (item.genre_ids || [])
                .map(id => GENRE_MAP[id])
                .filter(Boolean)
                .slice(0, 2)
                .join(" / ");

            // 3. 副标题逻辑: 日期 | 原名
            let subInfo = [];
            if (mode !== "update_today" && shortDate) subInfo.push(`📅 ${shortDate}`);
            else if (mode === "update_today") subInfo.push("🆕 今日");
            
            if (originalName && originalName !== displayName) subInfo.push(originalName);

            return {
                id: String(item.id),
                type: "tmdb",
                tmdbId: parseInt(item.id),
                mediaType: "tv",
                
                title: displayName,
                
                // 【UI 核心】年份 • 类型
                genreTitle: [year, genreText].filter(Boolean).join(" • "),
                
                // 副标题：日期 | 原名
                subTitle: subInfo.join(" | "),
                
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",
                
                rating: score,
                year: year,
                
                // 简介：评分 + 剧情
                description: `⭐ ${score} | ${item.overview || "暂无简介"}`
            };
        });

    } catch (e) {
        return [{ id: "error_net", type: "text", title: "网络错误", subTitle: e.message }];
    }
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
