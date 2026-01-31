/**
 * TMDB 动态榜单插件
 * 实现横竖版副标题自动切换
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var WidgetMetadata = {
  id: "tmdb_dynamic_list",
  title: "TMDB 动态榜单",
  description: "支持横竖版切换的 TMDB 实时数据源",
  author: "Gemini",
  version: "1.0.2",
  requiredVersion: "0.0.1",
  
  modules: [
    {
      title: "近期热门 (横版封面)",
      functionName: "loadTrendingHome",
      type: "video"
    },
    {
      title: "电影排行 (竖版海报)",
      functionName: "loadMovieRanking",
      type: "video",
      params: [
        { name: "page", title: "页码", type: "page", startPage: 1 }
      ]
    }
  ]
};

// --- 模块入口 ---

/**
 * 首页：展示本周热门（横版 UI）
 */
async function loadTrendingHome(params) {
  try {
    // 调用 TMDB 内置 API 获取本周全平台趋势
    const response = await Widget.tmdb.get("trending/all/week", {
      params: { language: "zh-CN" }
    });
    
    // 强制指定 1.77 比例（横版）
    return formatTmdbList(response.results, 1.77);
  } catch (e) {
    console.error("加载热门失败: " + e.message);
    return [];
  }
}

/**
 * 榜单页：展示高分电影（竖版 UI）
 */
async function loadMovieRanking(params) {
  try {
    const { page = 1 } = params;
    // 调用 TMDB 内置 API 获取高分电影
    const response = await Widget.tmdb.get("movie/top_rated", {
      params: { 
        language: "zh-CN",
        page: page 
      }
    });
    
    // 强制指定 0.75 比例（竖版）
    return formatTmdbList(response.results, 0.75);
  } catch (e) {
    console.error("加载榜单失败: " + e.message);
    return [];
  }
}

// --- 核心格式化逻辑 (关键：副标题处理) ---

function formatTmdbList(results, ratio) {
  if (!results || !Array.isArray(results)) return [];

  return results.map(item => {
    // 1. 提取基础信息
    const title = item.title || item.name || "未知标题";
    const dateStr = item.release_date || item.first_air_date || "2026-01-01";
    const year = dateStr.split("-")[0];
    
    // 2. 媒体类型处理 (TMDB 返回的 genre_ids 转换为简易文字)
    const mediaTypeText = item.media_type === "tv" ? "剧集" : "电影";

    // 3. 关键逻辑：根据 ratio 动态计算副标题 (description)
    let displaySubTitle = "";
    if (ratio > 1) {
      // 横版布局 (首页)：年份 · 类型 (例如: 2026 · 电影)
      displaySubTitle = `${year} · ${mediaTypeText}`;
    } else {
      // 竖版布局 (榜单)：具体年月日 (例如: 2026-01-31)
      displaySubTitle = dateStr;
    }

    return {
      id: item.id.toString(),
      type: "tmdb", // 使用内置 tmdb 类型自动加载详情
      title: title,
      description: displaySubTitle, // 设置副标题
      
      // 根据 ratio 选择封面图类型
      coverUrl: ratio > 1 ? item.backdrop_path : item.poster_path,
      coverRatio: ratio,
      
      rating: item.vote_average,
      releaseDate: dateStr,
      mediaType: (item.media_type === "tv" || item.name) ? "tv" : "movie"
    };
  });
}
