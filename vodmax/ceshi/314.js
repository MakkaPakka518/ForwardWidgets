/**
 * TMDB 动态榜单 (最终标准版)
 * 1. 解决横版双年份问题
 * 2. 自动适配横竖版 UI
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var WidgetMetadata = {
  id: "tmdb_adaptive_final",
  title: "TMDB 动态榜单",
  description: "自动适配 FW 横竖版设置，支持分类标签",
  author: "Gemini",
  version: "1.0.6",
  requiredVersion: "0.0.1",
  
  modules: [
    {
      title: "全球趋势榜",
      functionName: "loadTrending",
      type: "video",
      params: [
        { name: "page", title: "页码", type: "page", startPage: 1 }
      ]
    }
  ]
};

// --- 类型映射字典 ---
const GENRE_MAP = {
  28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
  18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "惊悚", 10402: "音乐", 
  9648: "悬疑", 10749: "爱情", 878: "科幻", 10770: "电视", 53: "惊悚", 
  10752: "战争", 37: "西部", 10759: "动作冒险", 10765: "科幻奇幻"
};

// --- 模块入口 ---
async function loadTrending(params) {
  try {
    const page = params.page || 1;
    // 使用内置 TMDB API
    const response = await Widget.tmdb.get("trending/all/week", {
      params: { 
        language: "zh-CN",
        page: page 
      }
    });

    if (!response || !response.results) return [];
    
    return formatItems(response.results);
  } catch (e) {
    console.error("TMDB 加载失败: " + e.message);
    return [];
  }
}

/**
 * 核心格式化函数
 */
function formatItems(results) {
  return results.map(item => {
    // 1. 提取日期
    const dateStr = item.release_date || item.first_air_date || "";
    
    // 2. 提取类型 (不加年份，防止横版重复)
    const genreText = (item.genre_ids || [])
      .map(id => GENRE_MAP[id])
      .filter(Boolean)
      .slice(0, 2)    // 只取前两个类型，防止横版太挤
      .join(" / ");

    const isMovie = (item.media_type === "movie" || item.title !== undefined);

    return {
      // 身份标识
      id: item.id.toString(),
      type: "tmdb", 
      
      // 文字信息
      title: item.title || item.name,
      
      // --- 关键修正：类型标签 ---
      // 只有类型，没有年份。FW 横版会自动在前面补上年份。
      genreTitle: genreText || (isMovie ? "电影" : "剧集"), 
      
      // --- 关键修正：副标题 ---
      // 竖版 UI 会直接显示这个具体日期
      description: dateStr, 
      
      // 传递给内核的数据
      releaseDate: dateStr,
      rating: item.vote_average,
      posterPath: item.poster_path,
      backdropPath: item.backdrop_path,
      mediaType: isMovie ? "movie" : "tv"
    };
  });
}
