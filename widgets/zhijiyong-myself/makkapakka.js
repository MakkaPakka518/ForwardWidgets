WidgetMetadata = {
  id: "gemini.platform.originals.v2.6",
  title: "流媒体·独家原创 (复刻版)",
  author: "Gemini & Makkapakka",
  description: "v2.6: 1:1复刻综艺榜逻辑。使用TMDB接口获取精准分集时间；格式严格统一为 01-31 S01E04 科幻。",
  version: "2.6.0",
  requiredVersion: "0.0.1",
  modules: [
    {
      title: "独家原创 & 追更日历",
      functionName: "loadPlatformOriginals",
      type: "list",
      requiresWebView: false,
      params: [
        // 1. 平台选择
        {
          name: "network",
          title: "出品平台",
          type: "enumeration",
          value: "213",
          enumOptions: [
            { title: "Netflix (网飞)", value: "213" },
            { title: "HBO (Max)", value: "49" },
            { title: "Apple TV+", value: "2552" },
            { title: "Disney+", value: "2739" },
            { title: "Amazon Prime", value: "1024" },
            { title: "Hulu", value: "453" },
            { title: "Peacock", value: "3353" },
            { title: "Paramount+", value: "4330" },
            { title: "腾讯视频", value: "2007" },
            { title: "爱奇艺", value: "1330" },
            { title: "Bilibili (B站)", value: "1605" },
            { title: "优酷视频", value: "1419" },
            { title: "芒果TV", value: "1631" },
            { title: "TVING (韩)", value: "4096" }
          ],
        },
        // 2. 内容类型
        {
          name: "contentType",
          title: "内容类型",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "📺 剧集 (默认)", value: "tv" },
            { title: "🎬 电影", value: "movie" },
            { title: "🌸 动漫/动画", value: "anime" },
            { title: "🎤 综艺/真人秀", value: "variety" }
          ]
        },
        // 3. 排序与功能
        {
          name: "sortBy",
          title: "排序与功能",
          type: "enumeration",
          value: "popularity.desc",
          enumOptions: [
            { title: "🔥 综合热度", value: "popularity.desc" },
            { title: "⭐ 最高评分", value: "vote_average.desc" },
            { title: "🆕 最新首播", value: "first_air_date.desc" },
            { title: "📅 按更新时间 (从近到远)", value: "next_episode" },
            { title: "📆 今日播出 (每日榜单)", value: "daily_airing" }
          ],
        },
        // 4. 页码
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ],
    },
  ],
};

// ==========================================
// 题材映射表 (用于显示中文类型)
// ==========================================
const GENRE_MAP = {
    10759: "动作冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
    18: "剧情", 10751: "家庭", 10762: "儿童", 9648: "悬疑", 10763: "新闻",
    10764: "真人秀", 10765: "科幻", 10766: "肥皂剧", 10767: "脱口秀",
    10768: "政治", 37: "西部", 28: "动作", 12: "冒险", 14: "奇幻", 
    878: "科幻", 27: "恐怖", 10749: "爱情", 53: "惊悚", 10752: "战争"
};

// ==========================================
// 工具函数 (复刻自综艺榜代码)
// ==========================================

// 格式化日期 MM-30
function formatShortDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${m}-${d}`;
}

// 获取中文题材
function getGenreName(ids) {
    if (!ids || ids.length === 0) return "";
    return GENRE_MAP[ids[0]] || "";
}

// ==========================================
// 主逻辑
// ==========================================

async function loadPlatformOriginals(params) {
  const networkId = params.network || "213";
  const contentType = params.contentType || "tv";
  const sortBy = params.sortBy || "popularity.desc";
  const page = params.page || 1;

  // 1. 基础列表查询 (Discover)
  let endpoint = "/discover/tv";
  let queryParams = {
      with_networks: networkId,
      language: "zh-CN",
      include_null_first_air_dates: false,
      page: page
  };

  if (contentType === "movie") {
    endpoint = "/discover/movie";
    if (sortBy === "first_air_date.desc") queryParams.sort_by = "release_date.desc";
    else if (sortBy === "next_episode" || sortBy === "daily_airing") queryParams.sort_by = "popularity.desc"; 
    else queryParams.sort_by = sortBy;
  } else {
    // TV 类型处理
    if (contentType === "anime") queryParams.with_genres = "16"; 
    else if (contentType === "variety") queryParams.with_genres = "10764|10767"; 

    // 排序预处理
    if (sortBy === "daily_airing") {
        const today = new Date().toISOString().split("T")[0]; 
        queryParams["air_date.gte"] = today;
        queryParams["air_date.lte"] = today;
        queryParams.sort_by = "popularity.desc";
    } else if (sortBy === "next_episode") {
        queryParams.sort_by = "popularity.desc"; // 先取热度，后排时间
    } else {
        if (sortBy.includes("vote_average")) queryParams["vote_count.gte"] = 100;
        queryParams.sort_by = sortBy;
    }
  }

  try {
    const res = await Widget.tmdb.get(endpoint, { params: queryParams });
    const items = res?.results || [];

    if (items.length === 0) {
      return page === 1 ? [{ title: "暂无数据", subTitle: "尝试切换类型或平台", type: "text" }] : [];
    }

    // === 2. 详情获取与格式化 (严格复刻综艺榜逻辑) ===
    
    // 判断是否需要查详细集数 (非电影 且 (追更 or 每日))
    const needDetails = (contentType !== "movie" && (sortBy === "next_episode" || sortBy === "daily_airing"));
    const processCount = needDetails ? 15 : 20;

    const processedItems = await Promise.all(items.slice(0, processCount).map(async (item) => {
        let displayStr = ""; 
        let sortDate = "1900-01-01";
        
        // 默认基础信息
        sortDate = item.first_air_date || item.release_date || "2099-01-01";
        const year = sortDate.substring(0, 4);
        const genre = getGenreName(item.genre_ids);
        
        if (needDetails) {
            // !!! 核心复刻：直接调用 TMDB 详情接口获取时间 !!!
            try {
                const detail = await Widget.tmdb.get(`/tv/${item.id}`, { params: { language: "zh-CN" } });
                if (detail) {
                    const nextEp = detail.next_episode_to_air;
                    const lastEp = detail.last_episode_to_air;

                    // 逻辑：优先显示 Next，没有则显示 Last
                    if (nextEp) {
                        sortDate = nextEp.air_date;
                        const dateStr = formatShortDate(sortDate);
                        const epStr = `S${String(nextEp.season_number).padStart(2,'0')}E${String(nextEp.episode_number).padStart(2,'0')}`;
                        // 格式：01-31 S01E04 科幻
                        displayStr = `${dateStr} ${epStr} ${genre}`;
                    } else if (lastEp) {
                        sortDate = lastEp.air_date;
                        const dateStr = formatShortDate(sortDate);
                        const epStr = `S${String(lastEp.season_number).padStart(2,'0')}E${String(lastEp.episode_number).padStart(2,'0')}`;
                        displayStr = `${dateStr} ${epStr} ${genre}`;
                    } else {
                        displayStr = `${year} ${genre}`;
                    }
                }
            } catch(e) {
                displayStr = `${year} ${genre}`;
            }
        } else {
            // 普通模式/电影
            const rating = item.vote_average ? `${item.vote_average.toFixed(1)}分` : "";
            displayStr = `${year} ${genre} ${rating}`;
        }

        return {
            ...item,
            _displayStr: displayStr,
            _sortDate: sortDate
        };
    }));

    // === 3. 本地排序 (复刻逻辑：今天往未来排) ===
    let finalItems = processedItems;
    
    if (sortBy === "next_episode" && contentType !== "movie") {
        finalItems.sort((a, b) => {
            // 字符串比对日期，效果等同于时间戳比对
            // 综艺榜代码: return a.sortDate > b.sortDate ? 1 : -1; (升序，近->远)
            if (a._sortDate === b._sortDate) return 0;
            return a._sortDate > b._sortDate ? 1 : -1; 
        });
    }

    return finalItems.map(item => buildCard(item, contentType));

  } catch (e) {
    return [{ title: "请求失败", subTitle: e.message, type: "text" }];
  }
}

function buildCard(item, contentType) {
    const isMovie = contentType === "movie";
    
    // 图片
    let imagePath = "";
    if (item.backdrop_path) imagePath = `https://image.tmdb.org/t/p/w780${item.backdrop_path}`;
    else if (item.poster_path) imagePath = `https://image.tmdb.org/t/p/w500${item.poster_path}`;

    // 使用拼接好的字符串
    const displayStr = item._displayStr || "";

    return {
        id: String(item.id),
        tmdbId: parseInt(item.id),
        type: "tmdb",
        mediaType: isMovie ? "movie" : "tv",
        title: item.name || item.title || item.original_name,
        
        // 严格执行你的要求：不带表情，格式统一
        subTitle: displayStr, 
        genreTitle: displayStr, // 右上角也显示
        
        description: item.overview || "暂无简介",
        posterPath: imagePath
    };
}
