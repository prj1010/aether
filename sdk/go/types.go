package aether

type Document struct {
	ID             string
	Title          string
	Filename       string
	Collection     string
	Version        int
	Content        string
	SourceURI      string
	ContentHash    string
	PageCount      int
	ValidFrom      string
	ValidTo        *string
	SupersededBy   *string
	Classification string
	Author         string
	CreatedAt      string
	UpdatedAt      string
	Status         string
}

type IndexedChunk struct {
	ID             string
	DocumentID     string
	Content        string
	Title          string
	Section        string
	Page           int
	SourceURI      string
	ContentHash    string
	Entities       []string
	TokenCount     int
	Ordinal        int
	DocTitle       string
	Collection     string
	Version        int
	ValidFrom      string
	ValidTo        *string
	Classification string
	Status         string
	Embedding      []float64
}

type Candidate struct {
	Chunk   IndexedChunk
	Sparse  float64
	Dense   float64
	Hybrid  float64
	Graph   float64
	Rerank  float64
	Reasons []string
}

type Citation struct {
	N          int     `json:"n"`
	ChunkID    string  `json:"chunkId"`
	DocumentID string  `json:"documentId"`
	Title      string  `json:"title"`
	Filename   string  `json:"filename"`
	Section    string  `json:"section"`
	Page       int     `json:"page"`
	Excerpt    string  `json:"excerpt"`
	Score      float64 `json:"score"`
	ValidFrom  string  `json:"validFrom"`
	ValidTo    *string `json:"validTo"`
	Version    int     `json:"version"`
}

type Conflict struct {
	Topic      string
	A          map[string]any
	B          map[string]any
	Resolution string
}

type Confidence struct {
	Score   float64
	Band    string
	Factors []map[string]any
}

type QueryPlan struct {
	Kind       string
	Path       string
	Strategies []string
	Reason     string
	UseMemory  bool
	UseGraph   bool
}

type MemoryItem struct {
	ID      string
	Layer   string
	Wing    string
	Room    string
	Content string
}

type Answer struct {
	Text            string
	Citations       []Citation
	Confidence      Confidence
	Path            string
	Kind            string
	LatencyMs       int
	Contradictions  []Conflict
	Followups       []string
	Model           string
	UsedLLM         bool
	Refused         bool
	InjectionFlags  []string
}

type SearchHit struct {
	ChunkID    string
	DocumentID string
	Title      string
	Section    string
	Page       int
	Excerpt    string
	Score      float64
	Collection string
}
