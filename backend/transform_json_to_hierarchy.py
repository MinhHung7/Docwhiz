def transform_json_to_hierarchy(data, parent_name="root"):
    """
    Transform input JSON to D3.js hierarchy format
    Input: {"main_topic": {"parent": {"children": {...}}}}
    Output: {"name": "main_topic", "children": [...], "content": "optional"}
    """
    if isinstance(data, dict):
        if len(data) == 1:
            key = list(data.keys())[0]
            value = data[key]

            result = {"name": key}

            if isinstance(value, dict):
                children = []
                for child_key, child_value in value.items():
                    # Nếu là chuỗi, xử lý như content của node con
                    if isinstance(child_value, str):
                        children.append({
                            "name": child_key,
                            "content": child_value
                        })
                    else:
                        children.append(transform_json_to_hierarchy({child_key: child_value}))
                if children:
                    result["children"] = children
            elif isinstance(value, str):
                result["content"] = value

            return result
        else:
            # Multiple keys at same level
            result = {"name": parent_name, "children": []}
            for key, value in data.items():
                result["children"].append(transform_json_to_hierarchy({key: value}))
            return result
    elif isinstance(data, str):
        return {"name": parent_name, "content": data}
    else:
        return {"name": str(data)}
