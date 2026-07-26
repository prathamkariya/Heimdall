import sys

# Re-route mkt_surveillance_ml imports to ml package (needed for loading unpickled joblib models)
try:
    import ml
    sys.modules['mkt_surveillance_ml'] = ml
    
    # Try importing submodules to populate sys.modules so the map covers everything
    try:
        import ml.anomaly
    except ImportError:
        pass
    try:
        import ml.models
    except ImportError:
        pass
    try:
        import ml.features
    except ImportError:
        pass
    try:
        import ml.detection
    except ImportError:
        pass
    try:
        import ml.evaluation
    except ImportError:
        pass
        
    # Map all submodules of ml to mkt_surveillance_ml in sys.modules
    for name, module in list(sys.modules.items()):
        if name == 'ml' or name.startswith('ml.'):
            alias_name = name.replace('ml', 'mkt_surveillance_ml', 1)
            sys.modules[alias_name] = module
except ImportError:
    pass
