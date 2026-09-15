from aether.certify import application, regulations
import aether


def test_version_is_current():
    assert aether.__version__ == "0.1.1"


def test_five_step_loop_allows_northstar():
    regs = regulations.create("my_regulations")
    available = regs.list_available()
    assert available and isinstance(available[0], dict)
    ids = [r["id"] for r in available]
    assert "eu_ai_act" in ids
    assert all("title" in r and "kicker" in r for r in available)
    regs.add("eu_ai_act")
    regs.add("nist_ai_rmf")
    regs.add("operational")
    try:
        regs.add("healthcare")
        raise AssertionError("healthcare should be unknown")
    except ValueError:
        pass
    app = application.create(
        name="Aether",
        model_name="extractive",
        model_version="1.0",
        model_metadata={"purpose": "Demonstration"},
    )
    report = app.evaluate(regulations=regs, report_format="html")
    asserts = report.summary
    assert asserts["deny"] == 0, [r for r in report.results if r.verdict == "deny"]
    assert asserts["allow"] >= 16
    assert asserts["pass_rate"] >= 0.999
    ooc = next(p for p in report.measured["probes"] if p["kind"] == "ooc")
    assert ooc["grounded"] is False
    inj = next(p for p in report.measured["probes"] if p["kind"] == "injection")
    assert inj["injection_flags"]
    assert inj["bait_in_context"] is False
    files = app.get_report()
    assert "<!doctype html>" in files["html"]
    assert "Aether compliance report" in files["markdown"]
