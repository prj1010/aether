package aether

import (
	"encoding/json"
	"fmt"
	"strings"

	_ "embed"
)

//go:embed data/northstar.json
var northstarJSON []byte

//go:embed data/golden.json
var goldenJSON []byte

type seedSection struct {
	Section string `json:"section"`
	Page    int    `json:"page"`
	Body    string `json:"body"`
}

type seedDoc struct {
	ID             string        `json:"id"`
	Title          string        `json:"title"`
	Filename       string        `json:"filename"`
	Collection     string        `json:"collection"`
	Version        int           `json:"version"`
	ValidFrom      string        `json:"validFrom"`
	ValidTo        *string       `json:"validTo"`
	SupersededBy   *string       `json:"supersededBy"`
	Classification string        `json:"classification"`
	Author         string        `json:"author"`
	PageCount      int           `json:"pageCount"`
	Status         string        `json:"status"`
	Sections       []seedSection `json:"sections"`
}

type goldenEx struct {
	ID              string   `json:"id"`
	Question        string   `json:"question"`
	ExpectedAnswer  string   `json:"expectedAnswer"`
	ExpectedSources []string `json:"expectedSources"`
	Kind            string   `json:"kind"`
}

func loadSeeds() []seedDoc {
	var s []seedDoc
	_ = json.Unmarshal(northstarJSON, &s)
	return s
}

func loadGolden() []goldenEx {
	var g []goldenEx
	_ = json.Unmarshal(goldenJSON, &g)
	return g
}

func seedDocuments() []Document {
	now := "2026-09-01T00:00:00.000Z"
	var docs []Document
	for _, s := range loadSeeds() {
		parts := make([]string, 0, len(s.Sections))
		for _, sec := range s.Sections {
			parts = append(parts, "## "+sec.Section+"\n\n"+sec.Body)
		}
		content := strings.Join(parts, "\n\n")
		docs = append(docs, Document{
			ID: s.ID, Title: s.Title, Filename: s.Filename, Collection: s.Collection,
			Version: s.Version, Content: content, SourceURI: "northstar://docs/" + s.Filename,
			ContentHash: contentHash(content), PageCount: s.PageCount, ValidFrom: s.ValidFrom,
			ValidTo: s.ValidTo, SupersededBy: s.SupersededBy, Classification: s.Classification,
			Author: s.Author, CreatedAt: s.ValidFrom + "T00:00:00.000Z", UpdatedAt: now, Status: s.Status,
		})
	}
	return docs
}

func chunkDocument(doc Document, sections []seedSection) []IndexedChunk {
	var chunks []IndexedChunk
	ordinal := 0
	for _, sec := range sections {
		for _, piece := range splitWindow(sec.Body, 900, 120) {
			emb := embed(doc.Title + " " + sec.Section + " " + piece)
			chunks = append(chunks, IndexedChunk{
				ID: fmt.Sprintf("%s::%d", doc.ID, ordinal), DocumentID: doc.ID, Content: piece,
				Title: doc.Title, Section: sec.Section, Page: sec.Page, SourceURI: doc.SourceURI,
				ContentHash: contentHash(piece), Entities: extractEntities(doc.Title + " " + sec.Section + " " + piece),
				TokenCount: estimateTokens(piece), Ordinal: ordinal, DocTitle: doc.Title,
				Collection: doc.Collection, Version: doc.Version, ValidFrom: doc.ValidFrom, ValidTo: doc.ValidTo,
				Classification: doc.Classification, Status: doc.Status, Embedding: emb,
			})
			ordinal++
		}
	}
	return chunks
}

func splitWindow(text string, maxChars, overlap int) []string {
	if len(text) <= maxChars {
		t := strings.TrimSpace(text)
		if t == "" {
			return nil
		}
		return []string{t}
	}
	paras := strings.Split(text, "\n\n")
	var out []string
	buf := ""
	for _, p := range paras {
		if buf != "" && len(buf+"\n\n"+p) > maxChars {
			out = append(out, strings.TrimSpace(buf))
			tail := buf
			if len(tail) > overlap {
				tail = tail[len(tail)-overlap:]
			}
			buf = tail + "\n\n" + p
		} else if buf == "" {
			buf = p
		} else {
			buf = buf + "\n\n" + p
		}
	}
	if strings.TrimSpace(buf) != "" {
		out = append(out, strings.TrimSpace(buf))
	}
	return out
}

func buildSeedIndex() ([]Document, []IndexedChunk) {
	docs := seedDocuments()
	seeds := loadSeeds()
	byID := map[string]seedDoc{}
	for _, s := range seeds {
		byID[s.ID] = s
	}
	var chunks []IndexedChunk
	for _, d := range docs {
		chunks = append(chunks, chunkDocument(d, byID[d.ID].Sections)...)
	}
	return docs, chunks
}
