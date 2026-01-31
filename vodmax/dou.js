/**
 * TMDB 演示插件
 * 功能：展示热门电影/电视剧，并支持搜索
 */
WidgetMetadata = {
  id: "tmdb_trending_demo",
  title: "TMDB 热门影视",
  description: "基于 TMDB API 的 Forward 插件开发示例",
  author: "Gemini",
  version: "1.0.1",
  requiredVersion: "0.0.1", //

  modules: [
    {
      title: "近期热门",
      functionName: "loadTrending",
      type: "video",
      params: [
        {
          name: "media_type",
          title: "呈现样式",
          type: "enumeration",
          value: "movie",
          enumOptions: [
            { title: "电影 (竖版海报)", value: "movie" },
            { title: "剧集 (横版剧照)", value: "tv" }
          ]
        },
        { name: "page", title: "页码", type: "page", startPage: 1 }
      ]
    }
  ]
};

async function loadTrending(params = {}) {
  try {
    const { media_type = "movie", page = 1 } = params;
    const response = await Widget.tmdb.get(`trending/${media_type}/week`, {
      params: { language: "zh-CN", page: page }
    });

    return parseTMDBResults(response.results, media_type);
  } catch (error) {
    console.error("加载失败:", error);
    return [];
  }
}

/**
 * 核心逻辑：格式化符合 UI 要求的副标题
 */
function parseTMDBResults(results, media_type) {
  if (!results) return [];

  return results.map(item => {
    const isMovie = (item.media_type || media_type) === "movie";
    const releaseDate = item.release_date || item.first_air_date || "";
    const year = releaseDate.split("-")[0];
    
    // 模拟获取类型名称（实际开发中可从 tmdb configuration 获取）
    const genreText = "影视"; 

    // --- 副标题处理逻辑 ---
    let subTitle = "";
    if (!isMovie) {
      // 横版样式要求：年份 · 类型 (例如: 2026 · 喜剧)
      subTitle = `${year} · ${genreText}`;
    } else {
      // 竖版样式要求：完整年月日 (例如: 2026-01-21)
      subTitle = releaseDate;
    }

    return {
      id: `tmdb.${item.id}`,
      type: "tmdb",
      title: item.title || item.name,
      description: subTitle, // 赋值给 description 字段作为副标题
      
      // 根据类型设置不同的封面比例
      coverUrl: isMovie ? item.poster_path : item.backdrop_path,
      coverRatio: isMovie ? 0.75 : 1.77, // 竖版 3:4, 横版 16:9
      
      releaseDate: releaseDate,
      rating: item.vote_average,
      mediaType: isMovie ? "movie" : "tv"
    };
  });
}
