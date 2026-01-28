WidgetMetadata = {
    id: "trakt_personal_public",
    title: "Trakt 个人中心 (公用Key版)",
    author: "MakkaPakka",
    description: "一站式管理 Trakt 待看/收藏/历史。内置高权重 Key，无需配置。",
    version: "2.2.0",
    requiredVersion: "0.0.1",
    site: "https://trakt.tv",

    // 1. 全局参数 (仅需用户名)
    globalParams: [
        {
            name: "traktUser",
            title: "Trakt 用户名 (必填)",
            type: "input",
            description: "你的 Trakt ID (Slug)，例如: makka_pakka",
            value: ""
        },
        // 依然保留选填，给高级用户用
        {
            name: "traktClientId",
            title: "Trakt Client ID (选填)",
            type: "input",
            description: "不填默认使用内置公用 Key (推荐不填)。",
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
                    value: "shows",
                    enumOptions: [
                        { title: "剧集", value: "shows" },
                        { title: "电影", value: "movies" }
                    ]
                },
                {
                    name: "sort",
                    title: "排序 (仅待看)",
                    type: "enumeration",
                    value: "added",
                    belongTo: { paramName: "section", value: ["watchlist"] },
                    enumOptions: [
                        { title: "按添加时间", value: "added" },
                        { title: "按排名", value: "rank" },
                        { title: "按发布时间", value: "released" }
                    ]
                },
                { name: "page", title: "页码", type: "page" }
            ]
        }
    ]
};

// 这是一个来自于开源社区的高可用 Key (Kodi Trakt Addon)
const PUBLIC_TRAKT_ID = "003666572e92c4331002a28114387693994e43f5454659f81640a232f08a5996";

async function loadTraktProfile(params = {}) {
    const { traktUser, section, type = "shows", sort = "added" } = params;
    const page = params.page || 1;
    
    // 智能 ID 选择逻辑
    // 只有当用户填了且长度足够（Trakt ID 都是 64 位）才用用户的，否则一律用公用 ID
    let clientId = PUBLIC_TRAKT_ID;
    if (params.traktClientId && params.traktClientId.length > 50) {
        clientId = params.traktClientId.trim();
    }

    if (!traktUser) return [{ id: "err", type: "text", title: "请填写 Trakt 用户名" }];

    // 构造 URL
    let url = "";
    if (section === "watchlist") {
        url = `https://api.trakt.tv/users/${traktUser}/watchlist/${type}/${sort}?extended=full&page=${page}&limit=15`;
    } else if (section === "collection") {
        url = `https://api.trakt.tv/users/${traktUser}/collection/${type}?extended=full&page=${page}&limit=15`;
    } else if (section === "history") {
        url = `https://api.trakt.tv/users/${traktUser}/history/${type}?extended=full&page=${page}&limit=15`;
    } else if (section === "ratings") {
        url = `https://api.trakt.tv/users/${traktUser}/ratings/${type}?extended=full&page=${page}&limit=15`;
    }

    console.log(`[Trakt] Fetching: ${url} (Key: ${clientId.substring(0,5)}...)`);

    try {
        const res = await Widget.http.get(url, {
            headers: { 
                "Content-Type": "application/json", 
                "trakt-api-version": "2", 
                "trakt-api-key": clientId 
            }
        });
        
        const data = res.data || [];
        
        // 错误处理：如果是 401/403，说明 Key 挂了或者用户设置了隐私
        if (!res.data && res.statusCode === 404) return [{ id: "err", type: "text", title: "用户不存在", subTitle: "请检查 Trakt 用户名是否正确" }];
        if (!res.data && (res.statusCode === 401 || res.statusCode === 403)) {
            // 如果是用户自己的 Key 挂了，尝试切换回公用 Key 重试一次
            if (clientId !== PUBLIC_TRAKT_ID) {
                console.log("User key failed, retrying with Public Key...");
                return await loadTraktProfile({ ...params, traktClientId: "" }); // 递归重试
            }
            return [{ id: "err", type: "text", title: "隐私受限或 Key 失效", subTitle: "请检查 Trakt 隐私设置" }];
        }

        if (data.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "列表为空" }] : [];

        const promises = data.map(async (item) => {
            const subject = item.show || item.movie || item;
            if (!subject?.ids?.tmdb) return null;

            let subInfo = `Trakt: ${subject.year || ""}`;
            if (section === "watchlist" && item.listed_at) subInfo = `添加于 ${item.listed_at.split('T')[0]}`;
            if (section === "history") subInfo = `观看于 ${item.watched_at.split('T')[0]}`;

            return await fetchTmdbDetail(subject.ids.tmdb, type === "movies" ? "movie" : "tv", subInfo, subject.title);
        });

        return (await Promise.all(promises)).filter(Boolean);

    } catch (e) {
        return [{ id: "err_net", type: "text", title: "网络错误", subTitle: e.message }];
    }
}

async function fetchTmdbDetail(id, type, subInfo, originalTitle) {
    try {
        const d = await Widget.tmdb.get(`/${type}/${id}`, { params: { language: "zh-CN" } });
        const year = (d.first_air_date || d.release_date || "").substring(0, 4);
        const genres = (d.genres || []).map(g => g.name).slice(0, 2).join(" / ");
        
        return {
            id: String(d.id), tmdbId: d.id, type: "tmdb", mediaType: type,
            title: d.name || d.title || originalTitle,
            genreTitle: [year, genres].filter(Boolean).join(" • "),
            subTitle: subInfo,
            posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
            backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : "",
            description: d.overview || "暂无简介",
            rating: d.vote_average?.toFixed(1),
            year: year
        };
    } catch (e) { return null; }
}
