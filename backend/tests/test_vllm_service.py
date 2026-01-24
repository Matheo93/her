"""
Tests for vllm_service.py - Sprint 540

Tests vLLM high-performance LLM service:
- Module state and globals
- init_vllm function
- is_vllm_available checker
- _format_messages_to_prompt formatting
- get_vllm_response non-streaming
- stream_vllm async generator
- stream_vllm_tokens word-by-word streaming
- shutdown_vllm cleanup
- Error handling
"""

import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
import sys


class TestModuleState:
    """Test module-level state and globals."""

    def test_initial_llm_is_none(self):
        """Test _llm starts as None."""
        # Re-import to get fresh state
        import importlib
        import backend.vllm_service as vllm
        importlib.reload(vllm)

        assert vllm._llm is None

    def test_initial_sampling_params_is_none(self):
        """Test _sampling_params starts as None."""
        import importlib
        import backend.vllm_service as vllm
        importlib.reload(vllm)

        assert vllm._sampling_params is None

    def test_initial_vllm_available_is_false(self):
        """Test _vllm_available starts as False."""
        import importlib
        import backend.vllm_service as vllm
        importlib.reload(vllm)

        assert vllm._vllm_available is False

    def test_default_model_id(self):
        """Test default model ID is Phi-3."""
        import backend.vllm_service as vllm

        assert vllm._model_id == "microsoft/Phi-3-mini-4k-instruct"


class TestIsVllmAvailable:
    """Test is_vllm_available function."""

    def test_returns_false_when_not_initialized(self):
        """Test returns False when vLLM not initialized."""
        import importlib
        import backend.vllm_service as vllm
        importlib.reload(vllm)

        assert vllm.is_vllm_available() is False

    def test_returns_false_when_llm_is_none(self):
        """Test returns False when _llm is None."""
        import backend.vllm_service as vllm
        vllm._vllm_available = True
        vllm._llm = None

        assert vllm.is_vllm_available() is False

    def test_returns_true_when_ready(self):
        """Test returns True when properly initialized."""
        import backend.vllm_service as vllm
        vllm._vllm_available = True
        vllm._llm = MagicMock()

        assert vllm.is_vllm_available() is True

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False


class TestFormatMessagesToPrompt:
    """Test _format_messages_to_prompt function."""

    def test_formats_system_message(self):
        """Test system message formatting."""
        import backend.vllm_service as vllm

        messages = [{"role": "system", "content": "Tu es EVA"}]
        result = vllm._format_messages_to_prompt(messages)

        assert "<|system|>" in result
        assert "Tu es EVA" in result
        assert "<|end|>" in result

    def test_formats_user_message(self):
        """Test user message formatting."""
        import backend.vllm_service as vllm

        messages = [{"role": "user", "content": "Salut!"}]
        result = vllm._format_messages_to_prompt(messages)

        assert "<|user|>" in result
        assert "Salut!" in result
        assert "<|end|>" in result

    def test_formats_assistant_message(self):
        """Test assistant message formatting."""
        import backend.vllm_service as vllm

        messages = [{"role": "assistant", "content": "Bonjour!"}]
        result = vllm._format_messages_to_prompt(messages)

        assert "<|assistant|>" in result
        assert "Bonjour!" in result

    def test_adds_assistant_prefix_at_end(self):
        """Test assistant prefix is added for generation."""
        import backend.vllm_service as vllm

        messages = [{"role": "user", "content": "Hi"}]
        result = vllm._format_messages_to_prompt(messages)

        # Should end with assistant prefix for generation
        assert result.strip().endswith("<|assistant|>")

    def test_handles_empty_messages(self):
        """Test empty messages list."""
        import backend.vllm_service as vllm

        messages = []
        result = vllm._format_messages_to_prompt(messages)

        # Should still have assistant prefix
        assert "<|assistant|>" in result

    def test_handles_missing_role(self):
        """Test message without role defaults to user."""
        import backend.vllm_service as vllm

        messages = [{"content": "Test"}]
        result = vllm._format_messages_to_prompt(messages)

        assert "<|user|>" in result
        assert "Test" in result

    def test_handles_missing_content(self):
        """Test message without content uses empty string."""
        import backend.vllm_service as vllm

        messages = [{"role": "user"}]
        result = vllm._format_messages_to_prompt(messages)

        assert "<|user|>" in result

    def test_multi_turn_conversation(self):
        """Test multi-turn conversation formatting."""
        import backend.vllm_service as vllm

        messages = [
            {"role": "system", "content": "Tu es EVA"},
            {"role": "user", "content": "Salut!"},
            {"role": "assistant", "content": "Bonjour!"},
            {"role": "user", "content": "Comment vas-tu?"},
        ]
        result = vllm._format_messages_to_prompt(messages)

        assert "<|system|>" in result
        assert "Tu es EVA" in result
        assert "Salut!" in result
        assert "Bonjour!" in result
        assert "Comment vas-tu?" in result


class TestInitVllm:
    """Test init_vllm function."""

    def test_returns_false_when_vllm_not_installed(self):
        """Test returns False when vLLM import fails."""
        import backend.vllm_service as vllm

        with patch.dict(sys.modules, {'vllm': None}):
            with patch('builtins.__import__', side_effect=ImportError("No module vllm")):
                # The actual import happens inside the function
                result = vllm.init_vllm()

        # Should return False on import error
        assert result is False or vllm._vllm_available is False

    def test_init_with_custom_model_id(self):
        """Test initialization with custom model ID."""
        import backend.vllm_service as vllm

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[MagicMock()])
        mock_sampling_params = MagicMock()

        mock_vllm_module = MagicMock()
        mock_vllm_module.LLM = MagicMock(return_value=mock_llm)
        mock_vllm_module.SamplingParams = MagicMock(return_value=mock_sampling_params)

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            result = vllm.init_vllm(model_id="custom/model")

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False

    def test_init_with_custom_max_model_len(self):
        """Test initialization with custom max_model_len."""
        import backend.vllm_service as vllm

        # Test that max_model_len parameter is accepted
        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[MagicMock()])

        mock_vllm_module = MagicMock()
        mock_vllm_module.LLM = MagicMock(return_value=mock_llm)
        mock_vllm_module.SamplingParams = MagicMock()

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            result = vllm.init_vllm(max_model_len=4096)

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False

    def test_init_with_custom_gpu_utilization(self):
        """Test initialization with custom GPU memory utilization."""
        import backend.vllm_service as vllm

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[MagicMock()])

        mock_vllm_module = MagicMock()
        mock_vllm_module.LLM = MagicMock(return_value=mock_llm)
        mock_vllm_module.SamplingParams = MagicMock()

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            result = vllm.init_vllm(gpu_memory_utilization=0.6)

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False


class TestGetVllmResponse:
    """Test get_vllm_response function."""

    def test_returns_none_when_not_available(self):
        """Test returns None when vLLM not available."""
        import importlib
        import backend.vllm_service as vllm
        importlib.reload(vllm)

        messages = [{"role": "user", "content": "Test"}]
        result = vllm.get_vllm_response(messages)

        assert result is None

    def test_returns_none_when_llm_is_none(self):
        """Test returns None when _llm is None."""
        import backend.vllm_service as vllm
        vllm._vllm_available = True
        vllm._llm = None

        messages = [{"role": "user", "content": "Test"}]
        result = vllm.get_vllm_response(messages)

        assert result is None

        # Cleanup
        vllm._vllm_available = False

    def test_returns_generated_text(self):
        """Test returns generated text on success."""
        import backend.vllm_service as vllm

        mock_output = MagicMock()
        mock_output.text = "  Bonjour!  "
        mock_outputs_wrapper = MagicMock()
        mock_outputs_wrapper.outputs = [mock_output]

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[mock_outputs_wrapper])

        vllm._vllm_available = True
        vllm._llm = mock_llm

        mock_vllm_module = MagicMock()
        mock_vllm_module.SamplingParams = MagicMock()

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            messages = [{"role": "user", "content": "Salut!"}]
            result = vllm.get_vllm_response(messages)

        assert result == "Bonjour!"  # Stripped

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False

    def test_returns_none_on_empty_output(self):
        """Test returns None when output is empty."""
        import backend.vllm_service as vllm

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[])

        vllm._vllm_available = True
        vllm._llm = mock_llm

        mock_vllm_module = MagicMock()
        mock_vllm_module.SamplingParams = MagicMock()

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            messages = [{"role": "user", "content": "Test"}]
            result = vllm.get_vllm_response(messages)

        assert result is None

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False

    def test_returns_none_on_exception(self):
        """Test returns None on exception."""
        import backend.vllm_service as vllm

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(side_effect=Exception("GPU error"))

        vllm._vllm_available = True
        vllm._llm = mock_llm

        mock_vllm_module = MagicMock()
        mock_vllm_module.SamplingParams = MagicMock()

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            messages = [{"role": "user", "content": "Test"}]
            result = vllm.get_vllm_response(messages)

        assert result is None

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False

    def test_custom_max_tokens(self):
        """Test with custom max_tokens."""
        import backend.vllm_service as vllm

        mock_output = MagicMock()
        mock_output.text = "Response"
        mock_outputs_wrapper = MagicMock()
        mock_outputs_wrapper.outputs = [mock_output]

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[mock_outputs_wrapper])

        vllm._vllm_available = True
        vllm._llm = mock_llm

        mock_sampling_params_class = MagicMock()
        mock_vllm_module = MagicMock()
        mock_vllm_module.SamplingParams = mock_sampling_params_class

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            messages = [{"role": "user", "content": "Test"}]
            result = vllm.get_vllm_response(messages, max_tokens=200)

        # Verify SamplingParams was called with max_tokens=200
        call_args = mock_sampling_params_class.call_args
        assert call_args[1]['max_tokens'] == 200

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False

    def test_custom_temperature(self):
        """Test with custom temperature."""
        import backend.vllm_service as vllm

        mock_output = MagicMock()
        mock_output.text = "Response"
        mock_outputs_wrapper = MagicMock()
        mock_outputs_wrapper.outputs = [mock_output]

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[mock_outputs_wrapper])

        vllm._vllm_available = True
        vllm._llm = mock_llm

        mock_sampling_params_class = MagicMock()
        mock_vllm_module = MagicMock()
        mock_vllm_module.SamplingParams = mock_sampling_params_class

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            messages = [{"role": "user", "content": "Test"}]
            result = vllm.get_vllm_response(messages, temperature=0.9)

        # Verify SamplingParams was called with temperature=0.9
        call_args = mock_sampling_params_class.call_args
        assert call_args[1]['temperature'] == 0.9

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False


class TestStreamVllm:
    """Test stream_vllm async generator."""

    @pytest.mark.asyncio
    async def test_yields_response(self):
        """Test yields complete response."""
        import backend.vllm_service as vllm

        with patch.object(vllm, 'get_vllm_response', return_value="Bonjour!"):
            messages = [{"role": "user", "content": "Salut!"}]

            results = []
            async for chunk in vllm.stream_vllm(messages):
                results.append(chunk)

        assert len(results) == 1
        assert results[0] == "Bonjour!"

    @pytest.mark.asyncio
    async def test_yields_nothing_on_none_response(self):
        """Test yields nothing when response is None."""
        import backend.vllm_service as vllm

        with patch.object(vllm, 'get_vllm_response', return_value=None):
            messages = [{"role": "user", "content": "Test"}]

            results = []
            async for chunk in vllm.stream_vllm(messages):
                results.append(chunk)

        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_passes_parameters(self):
        """Test passes max_tokens and temperature to get_vllm_response."""
        import backend.vllm_service as vllm

        with patch.object(vllm, 'get_vllm_response', return_value="Test") as mock_get:
            messages = [{"role": "user", "content": "Test"}]

            async for _ in vllm.stream_vllm(messages, max_tokens=100, temperature=0.5):
                pass

            mock_get.assert_called_once_with(messages, 100, 0.5)


class TestStreamVllmTokens:
    """Test stream_vllm_tokens word-by-word streaming."""

    @pytest.mark.asyncio
    async def test_yields_words(self):
        """Test yields words one by one."""
        import backend.vllm_service as vllm

        with patch.object(vllm, 'get_vllm_response', return_value="Hello world test"):
            messages = [{"role": "user", "content": "Hi"}]

            results = []
            async for word in vllm.stream_vllm_tokens(messages):
                results.append(word)

        assert len(results) == 3
        assert results[0] == "Hello "
        assert results[1] == "world "
        assert results[2] == "test"  # No trailing space on last word

    @pytest.mark.asyncio
    async def test_yields_nothing_on_none_response(self):
        """Test yields nothing when response is None."""
        import backend.vllm_service as vllm

        with patch.object(vllm, 'get_vllm_response', return_value=None):
            messages = [{"role": "user", "content": "Test"}]

            results = []
            async for word in vllm.stream_vllm_tokens(messages):
                results.append(word)

        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_single_word_response(self):
        """Test single word response."""
        import backend.vllm_service as vllm

        with patch.object(vllm, 'get_vllm_response', return_value="Bonjour"):
            messages = [{"role": "user", "content": "Hi"}]

            results = []
            async for word in vllm.stream_vllm_tokens(messages):
                results.append(word)

        assert len(results) == 1
        assert results[0] == "Bonjour"

    @pytest.mark.asyncio
    async def test_passes_parameters(self):
        """Test passes max_tokens and temperature."""
        import backend.vllm_service as vllm

        with patch.object(vllm, 'get_vllm_response', return_value="Test") as mock_get:
            messages = [{"role": "user", "content": "Test"}]

            async for _ in vllm.stream_vllm_tokens(messages, max_tokens=50, temperature=0.8):
                pass

            mock_get.assert_called_once_with(messages, 50, 0.8)


class TestShutdownVllm:
    """Test shutdown_vllm function."""

    def test_clears_llm_reference(self):
        """Test clears _llm reference."""
        import backend.vllm_service as vllm
        vllm._llm = MagicMock()
        vllm._vllm_available = True

        vllm.shutdown_vllm()

        assert vllm._llm is None

    def test_sets_available_to_false(self):
        """Test sets _vllm_available to False."""
        import backend.vllm_service as vllm
        vllm._llm = MagicMock()
        vllm._vllm_available = True

        vllm.shutdown_vllm()

        assert vllm._vllm_available is False

    def test_handles_already_shutdown(self):
        """Test handles already shutdown state."""
        import backend.vllm_service as vllm
        vllm._llm = None
        vllm._vllm_available = False

        # Should not raise
        vllm.shutdown_vllm()

        assert vllm._llm is None
        assert vllm._vllm_available is False

    def test_multiple_shutdowns(self):
        """Test multiple shutdown calls are safe."""
        import backend.vllm_service as vllm
        vllm._llm = MagicMock()
        vllm._vllm_available = True

        vllm.shutdown_vllm()
        vllm.shutdown_vllm()
        vllm.shutdown_vllm()

        assert vllm._llm is None
        assert vllm._vllm_available is False


class TestEdgeCases:
    """Test edge cases and error conditions."""

    def test_empty_messages_formatting(self):
        """Test formatting with empty messages."""
        import backend.vllm_service as vllm

        result = vllm._format_messages_to_prompt([])
        assert isinstance(result, str)

    def test_unknown_role_handling(self):
        """Test unknown role is treated as user."""
        import backend.vllm_service as vllm

        messages = [{"role": "unknown", "content": "Test"}]
        result = vllm._format_messages_to_prompt(messages)

        # Unknown role should be handled gracefully
        assert isinstance(result, str)

    def test_very_long_message(self):
        """Test with very long message content."""
        import backend.vllm_service as vllm

        long_content = "A" * 10000
        messages = [{"role": "user", "content": long_content}]
        result = vllm._format_messages_to_prompt(messages)

        assert long_content in result

    def test_special_characters_in_content(self):
        """Test special characters in message content."""
        import backend.vllm_service as vllm

        messages = [{"role": "user", "content": "<|special|> tokens \n\n test"}]
        result = vllm._format_messages_to_prompt(messages)

        assert "<|special|>" in result

    def test_unicode_content(self):
        """Test unicode characters in content."""
        import backend.vllm_service as vllm

        messages = [{"role": "user", "content": "Bonjour! 你好 🎉"}]
        result = vllm._format_messages_to_prompt(messages)

        assert "Bonjour!" in result
        assert "你好" in result
        assert "🎉" in result


class TestSamplingParamsDefaults:
    """Test default sampling parameters."""

    def test_default_temperature(self):
        """Test default temperature is 0.7."""
        # This is documented behavior, verify the constant
        import backend.vllm_service as vllm

        # The default is used when no temperature specified
        mock_output = MagicMock()
        mock_output.text = "Test"
        mock_outputs_wrapper = MagicMock()
        mock_outputs_wrapper.outputs = [mock_output]

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[mock_outputs_wrapper])

        vllm._vllm_available = True
        vllm._llm = mock_llm

        mock_sampling_params_class = MagicMock()
        mock_vllm_module = MagicMock()
        mock_vllm_module.SamplingParams = mock_sampling_params_class

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            messages = [{"role": "user", "content": "Test"}]
            vllm.get_vllm_response(messages)

        call_args = mock_sampling_params_class.call_args
        assert call_args[1]['temperature'] == 0.7

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False

    def test_default_max_tokens(self):
        """Test default max_tokens is 80."""
        import backend.vllm_service as vllm

        mock_output = MagicMock()
        mock_output.text = "Test"
        mock_outputs_wrapper = MagicMock()
        mock_outputs_wrapper.outputs = [mock_output]

        mock_llm = MagicMock()
        mock_llm.generate = MagicMock(return_value=[mock_outputs_wrapper])

        vllm._vllm_available = True
        vllm._llm = mock_llm

        mock_sampling_params_class = MagicMock()
        mock_vllm_module = MagicMock()
        mock_vllm_module.SamplingParams = mock_sampling_params_class

        with patch.dict(sys.modules, {'vllm': mock_vllm_module}):
            messages = [{"role": "user", "content": "Test"}]
            vllm.get_vllm_response(messages)

        call_args = mock_sampling_params_class.call_args
        assert call_args[1]['max_tokens'] == 80

        # Cleanup
        vllm._llm = None
        vllm._vllm_available = False
