WidgetMetadata = {
    id: "franchise_binge_pro",
    title: "系列电影大满贯",
    author: "MakkaPakka",
    description: "一键获取经典 IP 系列电影观看顺序，支持自定义搜索任意合集。",
    version: "2.0.2",
    requiredVersion: "0.0.1",
    site: "https://www.themoviedb.org",

    // 1. 全局参数
    globalParams: [
        {
            name: "apiKey",
            title: "TMDB API Key (必填)",
            type: "input",
            description: "用于获取合集数据。",
            value: ""
        }
    ],

    modules: [
        {
            title: "系列合集",
            functionName: "loadFranchise",
            type: "video", // 使用标准 video 类型
            cacheDuration: 3600, // 缓存1小时
            params: [
                // 2. 预设合集 (顶级 IP)
                {
                    name: "presetId",
                    title: "选择系列",
                    type: "enumeration",
                    value: "custom",
                    enumOptions: [
                        { title: "🔍 自定义搜索 (手动输入)", value: "custom" },
                        { title: "哈利波特 (Harry Potter)", value: "1241" },
                        { title: "漫威宇宙 (MCU)", value: "86311" }, // 复联只是MCU一部分，这里用复联合集代指，或者需要更复杂的MCU列表逻辑
                        { title: "007 詹姆斯邦德", value: "645" },
                        { title: "指环王 (Lord of the Rings)", value: "119" },
                        { title: "星球大战 (Star Wars)", value: "10" },
                        { title: "速度与激情", value: "9485" },
                        { title: "碟中谍 (Mission: Impossible)", value: "87359" },
                        { title: "蝙蝠侠 (Nolan)", value: "263" },
                        { title: "变形金刚", value: "8650" },
                        { title: "黑客帝国", value: "2344" },
                        { title: "加勒比海盗", value: "295" },
                        { title: "生化危机 (Resident Evil)", value: "8925" },
                        { title: "异形 (Alien)", value: "8091" },
                        { title: "教父 (The Godfather)", value: "230" },
                        { title: "玩具总动员", value: "10194" },
                        { title: "饥饿游戏", value: "131635" },
                        { title: "暮光之城", value: "33514" }
                    ]
                },
                // 3. 自定义搜索框 (联动显示)
                {
                    name: "customQuery",
                    title: "搜索系列名",
                    type: "input",
                    description: "例如：教父、功夫熊猫、John Wick",
                    belongTo: {
                        paramName: "presetId",
                        value: ["custom"]
                    }
                },
                // 4. 排序方式
                {
                    name: "sortOrder",
                    title: "观看顺序",
                    type: "enumeration",
                    value: "asc",
                    enumOptions: [
                        { title: "上映时间 (正序 1->N)", value: "asc" },
                        { title: "上映时间 (倒序 N->1)", value: "desc" },
                        { title: "评分 (高->低)", value: "rating" }
                    ]
                }
            ]
        }
    ]
};

async function loadFranchise(params = {}) {
    // 1. 获取参数
    const { apiKey, presetId = "custom", customQuery, sortOrder = "asc" } = params;

    if (!apiKey) {
        return [{
            id: "err_no_key",
            type: "text",
            title: "配置缺失",
            subTitle: "请在设置中填入 TMDB API Key"
        }];
    }

    let collectionId = presetId;
    let collectionName = "";

    // 2. 处理自定义搜索
    if (presetId === "custom") {
        if (!customQuery) {
            return [{
                id: "err_no_q",
                type: "text",
                title: "请输入搜索词",
                subTitle: "在配置中输入系列名称，例如“教父”"
            }];
        }

        console.log(`[Collection] Searching: ${customQuery}`);
        
        // 搜索合集
        const searchResult = await searchCollection(customQuery, apiKey);
        
        if (!searchResult) {
            // 如果没搜到合集，尝试搜电影，并返回提示
            return [{
                id: "err_404",
                type: "text",
                title: "未找到合集",
                subTitle: `TMDB 中没有 "${customQuery}" 的官方系列合集`
            }];
        }
        
        collectionId = searchResult.id;
        collectionName = searchResult.name;
    }

    console.log(`[Collection] Fetching ID: ${collectionId}`);

    // 3. 获取合集详情
    const url = `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${apiKey}&language=zh-CN`;

    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;

        // 校验数据有效性
        if (!data.parts || data.parts.length === 0) {
            return [{
                id: "err_empty",
                type: "text",
                title: "合集数据为空",
                subTitle: "该系列暂无影片信息"
            }];
        }

        // 4. 排序处理
        let movies = data.parts;
        movies.sort((a, b) => {
            if (sortOrder === "rating") {
                return b.vote_average - a.vote_average;
            } else {
                // 处理空日期的异常情况，将其排到最后
                const dateA = a.release_date ? new Date(a.release_date) : new Date("2099-01-01");
                const dateB = b.release_date ? new Date(b.release_date) : new Date("2099-01-01");
                return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
            }
        });

        // 5. 格式化输出
        const finalName = data.name || collectionName || "系列合集";
        
        return movies.map((item, index) => {
            const year = (item.release_date || "").substring(0, 4);
            const rank = index + 1;

            return {
                id: String(item.id),
                tmdbId: parseInt(item.id),
                type: "tmdb",
                mediaType: "movie",

                title: `${rank}. ${item.title}`,
                subTitle: `${year} · ⭐️ ${item.vote_average.toFixed(1)}`,
                
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : "",

                rating: item.vote_average ? item.vote_average.toFixed(1) : "0.0",
                year: year,
                
                description: `所属: ${finalName}\n${item.overview || ""}`
            };
        });

    } catch (e) {
        console.error(e);
        return [{
            id: "err_net",
            type: "text",
            title: "请求失败",
            subTitle: e.message
        }];
    }
}

// ==========================================
// 辅助工具
// ==========================================

async function searchCollection(query, apiKey) {
    const url = `https://api.themoviedb.org/3/search/collection?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=zh-CN&page=1`;
    try {
        const res = await Widget.http.get(url);
        const data = res.data || res;
        
        if (data.results && data.results.length > 0) {
            // 返回第一个结果，包含 id 和 name
            return data.results[0];
        }
    } catch (e) {}
    return null;
}
