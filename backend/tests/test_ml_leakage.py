"""tests/test_ml_leakage.py — Symbol leakage regression tests.

Ensures that the _audit_no_leakage guard in the ML training scripts correctly
raises an error if any metadata column (symbol, market, exchange, asset_id)
is present in the feature matrix passed to model.fit().

These tests follow TDD: they define the CONTRACT that must hold forever,
not the implementation detail of how the guard works.
"""
import os
import sys

import numpy as np
import pandas as pd
import pytest

# Make sure the ML src is on the path
_HERE = os.path.dirname(os.path.abspath(__file__))
_ML_SRC = os.path.join(_HERE, "..", "ml", "src")
sys.path.insert(0, os.path.abspath(_ML_SRC))

# -- Inline the same guard function used by the training scripts ---------------
# We test the contract, not a specific import path. Both train_zscored.py and
# train_weak_supervised.py define an equivalent _audit_no_leakage — we reproduce
# the canonical version here so this test file is self-contained.

_METADATA_COLUMNS = frozenset({"symbol", "exchange", "market", "asset_id", "ticker"})


def _audit_no_leakage(X_df: pd.DataFrame, context: str = "test") -> None:
    """Raise ValueError if any metadata column is present in X_df."""
    leaking = _METADATA_COLUMNS & set(X_df.columns)
    if leaking:
        raise ValueError(
            f"[{context}] Metadata leakage detected -- column(s) {sorted(leaking)} must be "
            "removed before fit()."
        )


# -- Helpers ------------------------------------------------------------------

def _clean_feature_df(n: int = 10) -> pd.DataFrame:
    """Return a DataFrame that contains only numerical features -- no metadata."""
    rng = np.random.default_rng(42)
    return pd.DataFrame({
        "return": rng.normal(0, 0.01, n),
        "log_return": rng.normal(0, 0.01, n),
        "volume_ratio_20d": rng.uniform(0.5, 2.0, n),
        "volatility_20d": rng.uniform(0.01, 0.05, n),
    })


# -- Tests --------------------------------------------------------------------


class TestSymbolLeakageAudit:
    """Regression tests for the metadata leakage guard."""

    def test_clean_df_does_not_raise(self):
        """A DataFrame with only numerical features must pass the audit silently."""
        df = _clean_feature_df()
        _audit_no_leakage(df)  # must not raise

    def test_symbol_column_raises(self):
        """A DataFrame containing 'symbol' must raise ValueError."""
        df = _clean_feature_df()
        df["symbol"] = "BTCUSDT"
        with pytest.raises(ValueError, match="symbol"):
            _audit_no_leakage(df)

    def test_market_column_raises(self):
        """A DataFrame containing 'market' must raise ValueError."""
        df = _clean_feature_df()
        df["market"] = "CRYPTO"
        with pytest.raises(ValueError, match="market"):
            _audit_no_leakage(df)

    def test_exchange_column_raises(self):
        """A DataFrame containing 'exchange' must raise ValueError."""
        df = _clean_feature_df()
        df["exchange"] = "BINANCE"
        with pytest.raises(ValueError, match="exchange"):
            _audit_no_leakage(df)

    def test_asset_id_column_raises(self):
        """A DataFrame containing 'asset_id' must raise ValueError."""
        df = _clean_feature_df()
        df["asset_id"] = 42
        with pytest.raises(ValueError, match="asset_id"):
            _audit_no_leakage(df)

    def test_ticker_column_raises(self):
        """A DataFrame containing 'ticker' must raise ValueError."""
        df = _clean_feature_df()
        df["ticker"] = "BTC"
        with pytest.raises(ValueError, match="ticker"):
            _audit_no_leakage(df)

    def test_multiple_metadata_columns_raise(self):
        """All leaking columns are reported in one error, not just the first found."""
        df = _clean_feature_df()
        df["symbol"] = "ETHUSDT"
        df["market"] = "CRYPTO"
        with pytest.raises(ValueError) as exc_info:
            _audit_no_leakage(df)
        msg = str(exc_info.value)
        assert "symbol" in msg
        assert "market" in msg

    def test_error_message_contains_context(self):
        """The error message must include the context label for easy log tracing."""
        df = _clean_feature_df()
        df["symbol"] = "SOL"
        with pytest.raises(ValueError, match=r"train_market\(CRYPTO\)"):
            _audit_no_leakage(df, context="train_market(CRYPTO)")

    def test_extra_numerical_columns_are_allowed(self):
        """Extra numerical columns not in the metadata denylist do not raise."""
        df = _clean_feature_df()
        df["rsi_14d"] = 55.0
        df["macd"] = 1.23
        _audit_no_leakage(df)  # must not raise


class TestTrainingScriptGuardIntegration:
    """Smoke tests that the guard functions inside the real training scripts
    have identical semantics (not just the inline version above).
    """

    def test_train_zscored_audit_raises_on_symbol(self):
        """train_zscored._audit_no_leakage must refuse a df with 'symbol'."""
        import importlib.util
        script = os.path.join(
            _HERE, "..", "ml", "scripts", "train_zscored.py"
        )
        spec = importlib.util.spec_from_file_location("train_zscored", script)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        df = _clean_feature_df()
        df["symbol"] = "BTCUSDT"
        with pytest.raises(ValueError, match="symbol"):
            mod._audit_no_leakage(df, context="integration_test")

    def test_train_weak_supervised_audit_raises_on_symbol(self):
        """train_weak_supervised._audit_no_leakage must refuse a df with 'symbol'."""
        import importlib.util
        script = os.path.join(
            _HERE, "..", "ml", "scripts", "train_weak_supervised.py"
        )
        spec = importlib.util.spec_from_file_location("train_weak_supervised", script)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        df = _clean_feature_df()
        df["symbol"] = "ETHUSDT"
        with pytest.raises(ValueError, match="symbol"):
            mod._audit_no_leakage(df, context="integration_test")
