"""Tests for StandardContexts and constants."""

from xache.constants.standard_contexts import StandardContexts, STANDARD_CONTEXT_VALUES


class TestStandardContexts:
    def test_user_preference(self):
        assert StandardContexts.USER_PREFERENCE == "xache.user.preference"

    def test_error_fix(self):
        assert StandardContexts.ERROR_FIX == "xache.error.fix"

    def test_successful_pattern(self):
        assert StandardContexts.SUCCESSFUL_PATTERN == "xache.pattern.success"

    def test_failed_approach(self):
        assert StandardContexts.FAILED_APPROACH == "xache.pattern.failure"

    def test_tool_config(self):
        assert StandardContexts.TOOL_CONFIG == "xache.tool.config"

    def test_conversation_summary(self):
        assert StandardContexts.CONVERSATION_SUMMARY == "xache.conversation.summary"

    def test_domain_heuristic(self):
        assert StandardContexts.DOMAIN_HEURISTIC == "xache.domain.heuristic"

    def test_optimization_insight(self):
        assert StandardContexts.OPTIMIZATION_INSIGHT == "xache.optimization.insight"

    def test_graph_entity(self):
        assert StandardContexts.GRAPH_ENTITY == "xache.graph.entity"

    def test_graph_relationship(self):
        assert StandardContexts.GRAPH_RELATIONSHIP == "xache.graph.relationship"

    def test_all_values_in_set(self):
        assert len(STANDARD_CONTEXT_VALUES) == 10
        assert StandardContexts.USER_PREFERENCE in STANDARD_CONTEXT_VALUES
        assert StandardContexts.GRAPH_RELATIONSHIP in STANDARD_CONTEXT_VALUES

    def test_all_follow_naming_convention(self):
        for value in STANDARD_CONTEXT_VALUES:
            assert value.startswith("xache.")
            parts = value.split(".")
            assert len(parts) == 3
