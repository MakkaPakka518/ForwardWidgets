WidgetMetadata = {
    id: "trakt_personal_mixed",
    title: "Trakt 个人中心",
    author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
    description: "一站式获取 Trakt 待看/收藏/历史。",
    version: "1.0.4",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    globalParams: [
        {
            name: "traktUser",
            title: "Trakt 用户名 (必填)",
            type: "input",
            description: "你的 Trakt ID (Slug)",
            value: ""
        },
        {
            name: "traktClientId",
            title: "Trakt Client ID (必填)",
            type: "input",
            description: "请前往 trakt.tv/oauth/applications 申请",
            value: ""
        }
    ],

    modules: [
        {
            title: "我的片单",
            functionName: "loadTraktProfile",
            type: "list",
            cacheDuration: 300,
            params: [
                {
                    name: "section",
                    title: "浏览区域",
                    type: "enumeration",
                    value: "watchlist",
                    enumOptions: [
                        { title: "📜 待看列表 (Watchlist)", value: "watchlist" },
                        { title: "📦 收藏列表 (Collection)", value: "collection" },
                        { title: "🕒 观看历史 (History)", value: "history" },
                        { title: "⭐ 评分记录 (Ratings)", value: "ratings" }
                    ]
                },
                {
                    name: "type",
                    title: "内容筛选",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "全部 (剧集+电影)", value: "all" }, // 新增混合模式
                        { title: "剧集", value: "shows" },
                        { title: "电影", value: "movies" }
                    ]
                },
                {
                    name: "sort",
                    title: "排序 (仅待看)",
                    type: "enumeration",
                    value: "added,desc",
                    belongTo: { paramName: "section", value: ["watchlist"] },
                    enumOptions: [
                        { title: "最新添加", value: "added,desc" },
                        { title: "最早添加", value: "added,asc" },
                        { title: "默认排行", value: "rank,asc" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

async function loadTraktProfile(params = {}) {
    const { traktUser, traktClientId, section, type = "all", sort = "added,desc", page = 1 } = params;

    if (!traktUser) return [{ id: "err_user", type: "text", title: "请填写 Trakt 用户名" }];
    if (!traktClientId) return [{ id: "err_id", type: "text", title: "请填写 Trakt Client ID" }];

    // --- 混合模式处理 (All) ---
    // Trakt API 不支持直接分页获取混合列表
    // 策略：如果是 "all"，我们同时请求 shows 和 movies，然后在本地合并
    // 注意：混合分页比较复杂，这里采用 "伪混合"：
    // Page 1: 取 Movie Page 1 + Show Page 1，按时间排序，截取前 15 个。
    // 这种方式在翻页时可能会有遗漏或重复，但在 Widget 这种轻量场景下是可接受的。
    
    let rawItems = [];

    if (type === "all") {
        // 并发请求 Movie 和 Show
        const [movies, shows] = await Promise.all([
            fetchTraktList(section, "movies", sort, page, traktUser, traktClientId),
            fetchTraktList(section, "shows", sort, page, traktUser, traktClientId)
        ]);
        
        // 合并
        rawItems = [...movies, ...shows];
        
        // 本地排序 (混合后必须重排)
        // 依据 listed_at (Watchlist), watched_at (History), rated_at (Ratings), collected_at
        // 统称为 timeKey
        rawItems.sort((a, b) => {
            const timeA = new Date(getItemTime(a, section)).getTime();
            const timeB = new Date(getItemTime(b, section)).getTime();
            // 降序 (最新的在前)
            return sort.includes("asc") ? timeA - timeB : timeB - timeA;
        });
        
        // 截取当前页数量 (15个)
        // 注意：因为我们要混合，所以实际上我们要的数据可能横跨两个API的页码
        // 简单处理：每次都取两边的 Page N，然后混合，虽然不精确，但够用。
        // 或者：显示 30 个 (15+15)
        // 这里不做 slice，全部返回给用户看，体验更好
        
    } else {
        // 单一模式
        rawItems = await fetchTraktList(section, type, sort, page, traktUser, traktClientId);
    }

    if (!rawItems || rawItems.length === 0) {
        return page === 1 ? [{ id: "empty", type: "text", title: "列表为空" }] : [];
    }

    // 转换为 Forward Items
    const promises = rawItems.map(async (item) => {
        const subject = item.show || item.movie || item;
        const mediaType = item.show ? "tv" : "movie";
        if (!subject?.ids?.tmdb) return null;

        let subInfo = "";
        const timeStr = getItemTime(item, section);
        if (timeStr) {
            const date = timeStr.split('T')[0];
            if (section === "watchlist") subInfo = `添加于 ${date}`;
            else if (section === "history") subInfo = `观看于 ${date}`;
            else if (section === "ratings") subInfo = `评分 ${item.rating} (${date})`;
            else subInfo = date;
        } else {
            subInfo = `Trakt: ${subject.year || ""}`;
        }

        // 拼接类型标签
        if (type === "all") {
            subInfo = `[${mediaType === "tv" ? "剧集" : "电影"}] ${subInfo}`;
        }

        return await fetchTmdbDetail(subject.ids.tmdb, mediaType, subInfo, subject.title);
    });

    return (await Promise.all(promises)).filter(Boolean);
}

// 通用 Trakt 请求
async function fetchTraktList(section, type, sort, page, user, id) {
    let url = "";
    const sortMode = sort.split(",")[0]; 
    
    // 增加 limit，如果是混合模式，每边取 10 个，凑 20 个
    const limit = 15; 

    if (section === "watchlist") {
        url = `https://api.trakt.tv/users/${user}/watchlist/${type}/${sortMode}?extended=full&page=${page}&limit=${limit}`;
    } else if (section === "collection") {
        url = `https://api.trakt.tv/users/${user}/collection/${type}?extended=full&page=${page}&limit=${limit}`;
    } else if (section === "history") {
        url = `https://api.trakt.tv/users/${user}/history/${type}?extended=full&page=${page}&limit=${limit}`;
    } else if (section === "ratings") {
        url = `https://api.trakt.tv/users/${user}/ratings/${type}?extended=full&page=${page}&limit=${limit}`;
    }

    try {
        const res = await Widget.http.get(url, {
            headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": id }
        });
        return Array.isArray(res.data) ? res.data : [];
    } catch (e) { return []; }
}

// 获取用于排序的时间字段
function getItemTime(item, section) {
    if (section === "watchlist") return item.listed_at;
    if (section === "history") return item.watched_at;
    if (section === "collection") return item.collected_at;
    if (section === "ratings") return item.rated_at;
    return null;
}

// TMDB 详情 (免 Key)
async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        const genreText = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");
        
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || originalTitle,
            genreTitle: [year, genreText].filter(Boolean).join(" • "),
            subTitle: subInfo,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            description: d.overview || "暂无简介",
            rating: d.vote_average?.toFixed(1),
            year: year
        };
    } catch (e) { return null; }
}
