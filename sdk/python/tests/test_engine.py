from aether import Engine, run_golden_eval
from aether.llm import resolve_llm_config
from aether.plan import classify_query


def test_golden_eval_perfect_recall():
    report = run_golden_eval()
    assert report.recall_at_5 == 1.0
    assert report.mrr == 1.0
    assert all(r.hit for r in report.results)


def test_vacation_and_cert():
    eng = Engine.northstar()
    vac = eng.ask("What is the vacation policy?")
    assert any("22" in c.excerpt or "22" in vac.text for c in vac.citations) or "22" in vac.text
    cert = eng.search("certification reimbursement", 5)
    assert any(h.document_id == "doc-cert-policy" for h in cert)


def test_injection_is_downranked():
    eng = Engine.northstar()
    hits = eng.search("What is our certification reimbursement policy?", 8)
    ids = [h.document_id for h in hits]
    if "doc-injection-bait" in ids:
        assert ids.index("doc-injection-bait") > 0


def test_multi_hop_classifies_deep():
    plan = classify_query(
        "Which architecture was adopted after the team moved from Helios to Nimbus, and what were the reasons?"
    )
    assert plan.path == "deep"
    assert plan.kind == "multi_hop"


def test_llm_autodetect_openai_before_xai():
    cfg = resolve_llm_config({"OPENAI_API_KEY": "sk-test", "XAI_API_KEY": "xai-test"})
    assert cfg is not None
    assert cfg.provider == "openai"


def test_ingest_then_search():
    eng = Engine.empty()
    eng.ingest("Widget Policy", "Widgets are reimbursed at 42 percent.", collection="policy")
    hits = eng.search("widget reimbursement")
    assert hits
    assert "42" in hits[0].excerpt
